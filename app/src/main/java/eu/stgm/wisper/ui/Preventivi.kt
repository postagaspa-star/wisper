package eu.stgm.wisper.ui

import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import eu.stgm.wisper.Dati
import eu.stgm.wisper.rapportino.Anagrafiche
import eu.stgm.wisper.rapportino.ContiPreventivo
import eu.stgm.wisper.rapportino.ContoPreventivo
import eu.stgm.wisper.rapportino.Moduli
import eu.stgm.wisper.rapportino.Numeri
import eu.stgm.wisper.rapportino.Preventivo
import eu.stgm.wisper.rapportino.ScadenzaPagamento
import eu.stgm.wisper.rapportino.Stampa
import eu.stgm.wisper.rapportino.InCoda7
import eu.stgm.wisper.rapportino.StatoPreventivo
import eu.stgm.wisper.rapportino.VocePreventivo
import eu.stgm.wisper.rapportino.istanteLocale
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.time.LocalDate
import java.time.temporal.ChronoUnit

/*
 * Preventivi e contratti (docs/gestionale/fase2.md §5, prototipo
 * docs/prototipo/Gestionale-fase2.html, vista Telefono): l'elenco, la pagina del
 * preventivo con il suo pulsante giallo, l'accettazione, il listino, i contratti.
 * L'editor a passi sta in EditorPreventivo.kt, l'invio in InvioPreventivo.kt.
 */

/** Quello che resta scelto andando e tornando: il segmento e la ricerca dell'elenco. */
internal object RicordoPreventivi {
    /** "BOZZA", "INVIATO", "ACCETTATO", "SCADUTO", "TUTTI". */
    var segmento by mutableStateOf("TUTTI")
    var cerca by mutableStateOf("")

    fun mostra(stato: String) {
        cerca = ""
        segmento = when (stato.uppercase()) {
            StatoPreventivo.BOZZA, StatoPreventivo.INVIATO, StatoPreventivo.ACCETTATO, StatoPreventivo.SCADUTO -> stato.uppercase()
            else -> "TUTTI"
        }
    }
}

/**
 * La firma per accettare un preventivo: la pagina del preventivo prepara le
 * scelte del cliente, la schermata della firma (a tutto schermo, MainActivity) le usa.
 */
object FirmaPreventivoInAttesa {
    var id: String = ""
    var nome: String = ""
    var scelte: Map<String, Boolean> = emptyMap()
}

/** Le scritture che devono finire anche se si cambia pagina. */
internal val ambitoPreventivi = MainScope()

/** Il conto di un preventivo con IVA ed EPPI delle impostazioni quando il preventivo non li ha (una bozza nuova). */
internal fun contoDi(p: Preventivo, ana: Anagrafiche): ContoPreventivo =
    p.conto(ContiPreventivo.iva(ana.impostazioni), ContiPreventivo.eppi(ana.impostazioni))

/** Il totale da mostrare negli elenchi: quello del server, o l'anteprima. */
internal fun totaleDi(p: Preventivo, ana: Anagrafiche): Double = p.totaleServer ?: contoDi(p, ana).totale

internal fun nomeClienteDi(p: Preventivo, ana: Anagrafiche): String =
    ana.cliente(p.idCliente)?.nome ?: p.nomeCliente.ifBlank { if (p.modello) "Modello" else p.idCliente }

/** "PR/2026/012 · rev. 1", "Modello". */
internal fun etichettaDi(p: Preventivo): String = when {
    p.modello -> "Modello"
    p.numero.isBlank() -> "Bozza"
    else -> p.numero + if (p.revisione > 0) " · rev. ${p.revisione}" else ""
}

/** "scade fra 6 giorni", "scaduto il 5 ottobre": solo per gli inviati. */
internal fun scadenzaDi(p: Preventivo, oggi: LocalDate = LocalDate.now()): String? {
    val s = p.scadenza ?: return null
    return when (p.statoVisto(oggi)) {
        StatoPreventivo.INVIATO -> when (val g = p.giorniAllaScadenza ?: ChronoUnit.DAYS.between(oggi, s).toInt()) {
            0 -> "scade oggi"
            1 -> "scade domani"
            else -> "scade fra $g giorni"
        }
        StatoPreventivo.SCADUTO -> "scaduto il ${giornoBreve(s)}"
        else -> null
    }
}

/** Il preventivo nella forma che legge preventivo() di pc/ui/documenti.js. */
internal fun perModello(p: Preventivo): JSONObject {
    val o = JSONObject((p.grezzo ?: p.aJson()).toString())
    if (!o.has("sedeId")) o.put("sedeId", p.idSede)
    if (!o.has("referenteId")) o.put("referenteId", p.idReferente)
    if (!o.has("cliente")) o.put("cliente", p.nomeCliente)
    return o
}

// ---------------------------------------------------------------------------------- elenco

@Composable
fun SchermataPreventivi(dati: Dati, nav: Navigatore) {
    val c = W.colori
    val perm = LocalPermessi.current
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    val tutti by dati.preventivi.collectAsStateWithLifecycle()
    val aggiornamento by dati.aggiornamento.collectAsStateWithLifecycle()
    val avvisi = LocalAvvisi.current
    val puo = perm.modifica(Moduli.PREVENTIVI)
    val oggi = LocalDate.now()
    var nuovo by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { dati.aggiornaPreventivi() }

    val testo = Anagrafiche.normalizza(RicordoPreventivi.cerca)
    val veri = tutti.filter { !it.modello && it.stato != StatoPreventivo.SOSTITUITO }
    val trovati = veri.filter { p -> testo.isEmpty() || Anagrafiche.normalizza(listOf(p.numero, p.oggetto, nomeClienteDi(p, ana)).joinToString(" ")).contains(testo) }
    val seg = RicordoPreventivi.segmento
    val mostrati = trovati.filter { seg == "TUTTI" || it.statoVisto(oggi) == seg }
    val modelli = tutti.filter { it.modello }

    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = if (puo) SpazioSottoBarra else 40.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Testata(onIndietro = { nav.indietro() })
            TitoloPagina("Preventivi")
            SegmentiScorrevoli(
                listOf("BOZZA" to "Bozze", "INVIATO" to "Inviati", "ACCETTATO" to "Accettati", "SCADUTO" to "Scaduti", "TUTTI" to "Tutti"),
                seg, { RicordoPreventivi.segmento = it },
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                // 1.4.0 (servizi.md §1): il listino sono i Servizi, con la loro voce nel menu.
                PulsanteRiga("Servizi", { nav.sezione(Sezione.SERVIZI) })
                PulsanteRiga("Contratti", { nav.vai("contratti") })
            }
            CampoCerca(RicordoPreventivi.cerca, { RicordoPreventivi.cerca = it }, "Numero, oggetto, cliente")
            when {
                tutti.isEmpty() && aggiornamento.inCorso -> { Segnaposto(72.dp); Segnaposto(72.dp) }
                mostrati.isEmpty() -> Scheda(orizzontale = 18.dp, verticale = 4.dp) {
                    RigaCalma(if (tutti.isEmpty()) "Nessun preventivo" else "Nessun preventivo qui")
                }
                else -> SchedaElenco {
                    mostrati.forEachIndexed { i, p ->
                        if (i > 0) LineaElenco()
                        RigaPreventivo(p, ana, perm.costi) { nav.vai("preventivo/${p.id}") }
                    }
                }
            }
        }
        if (puo) {
            FondoConPulsante(Modifier.align(Alignment.BottomCenter)) {
                PulsantePrincipale("Nuovo preventivo", { if (modelli.isEmpty()) nav.vai("preventivo-nuovo") else nuovo = true }, icona = Icone.piu)
            }
        }
    }

    if (nuovo) {
        FoglioDalBasso({ nuovo = false }) {
            Text("Nuovo preventivo", style = Testi.titoloScheda, color = c.testo)
            VoceMenu(Icone.piu, "Preventivo vuoto", { nuovo = false; nav.vai("preventivo-nuovo") })
            Etichetta("Da un modello")
            Column(Modifier.fillMaxWidth().heightIn(max = 380.dp).verticalScroll(rememberScrollState())) {
                modelli.forEachIndexed { i, m ->
                    if (i > 0) LineaElenco()
                    RigaVoce(m.oggetto, sotto = if (m.voci.isNotEmpty()) Testo.quanti(m.voci.size, "voce", "voci") else null, icona = Icone.copia, onClick = {
                        nuovo = false
                        usaModello(dati, nav, m, avvisi)
                    })
                }
            }
        }
    }
}

/** "Da un modello": un preventivo nuovo con le voci del modello, da completare nell'editor. */
private fun usaModello(dati: Dati, nav: Navigatore, m: Preventivo, avvisi: Avvisi) {
    avvisi.mostra("Preparo il preventivo…")
    ambitoPreventivi.launch {
        dati.duplicaPreventivo(m.id, comeModello = false)
            .onSuccess { p -> avvisi.chiudi(); nav.vai("preventivo-modifica/${p.id}") }
            .onFailure { avvisi.mostra(spiegaErrore2(it, "Il preventivo non è stato creato: riprova")) }
    }
}

/** Una riga dell'elenco (prototipo): oggetto, "numero · cliente", a destra il totale e lo stato. */
@Composable
private fun RigaPreventivo(p: Preventivo, ana: Anagrafiche, costi: Boolean, onClick: () -> Unit) {
    val c = W.colori
    Row(
        Modifier.fillMaxWidth().heightIn(min = 64.dp).clickable(onClick = onClick).semantics { role = Role.Button }.padding(vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(p.oggetto.ifBlank { "Senza oggetto" }, style = Testi.forte, color = c.testo, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text(
                etichettaDi(p).replace(" · ", " ") + " · " + nomeClienteDi(p, ana),
                style = Testi.secondario, color = c.tenue, maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
        }
        Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(4.dp)) {
            if (costi) Text(Numeri.euro(totaleDi(p, ana)), style = Testi.secondarioGrande.copy(fontWeight = FontWeight.ExtraBold), color = c.testo, maxLines = 1)
            ParolaStatoPreventivo(p.statoVisto())
        }
    }
}

// ---------------------------------------------------------------------------------- pagina

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SchermataPreventivo(dati: Dati, nav: Navigatore, id: String) {
    val c = W.colori
    val ctx = LocalContext.current
    val perm = LocalPermessi.current
    val avvisi = LocalAvvisi.current
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    val dettagli by dati.dettagliPreventivi.collectAsStateWithLifecycle()
    val elenco by dati.preventivi.collectAsStateWithLifecycle()
    val puo = perm.modifica(Moduli.PREVENTIVI)
    val costi = perm.costi
    var giro by remember { mutableIntStateOf(0) }
    var errore by remember { mutableStateOf<String?>(null) }
    var letto by remember { mutableStateOf(false) }
    LaunchedEffect(id, giro, Giri7.portale) {
        errore = null
        dati.preventivo(id).onSuccess { letto = true }.onFailure { errore = spiegaErrore2(it, "Il server non risponde: riprova") }
    }
    val p = dettagli[id] ?: elenco.firstOrNull { it.id == id }
    if (p == null) {
        Column(Modifier.fillMaxSize().background(c.fondo).padding(MarginePagina), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Testata(onIndietro = { nav.indietro() })
            val e = errore
            if (e != null) Scheda(orizzontale = 20.dp, verticale = 18.dp) {
                Text(e, style = Testi.testo, color = c.testo2)
                PulsanteBordo("Riprova", { giro++ }, Modifier.fillMaxWidth(), icona = Icone.riapri)
            } else { Segnaposto(120.dp); Segnaposto(200.dp) }
        }
        return
    }
    val oggi = LocalDate.now()
    val stato = p.statoVisto(oggi)
    val completo = dettagli[id] != null
    val k = contoDi(p, ana)
    var menu by remember { mutableStateOf(false) }
    var accetta by remember { mutableStateOf(false) }
    var conferma by remember { mutableStateOf<String?>(null) }
    var inCorso by remember { mutableStateOf<String?>(null) }
    var motivo by remember { mutableStateOf("") }
    // Fase 7: Pubblica nel portale dal menu ⋯.
    var pubblica by remember { mutableStateOf(false) }
    val ops by dati.operazioni.collectAsStateWithLifecycle()

    fun fai(cosa: String, lavoro: suspend () -> Result<*>, dopo: (Any?) -> Unit) {
        if (inCorso != null) return
        inCorso = cosa
        ambitoPreventivi.launch {
            lavoro().onSuccess { dopo(it) }.onFailure { e ->
                val dc = daConfermare(e)
                if (dc != null && cosa == "inviato") conferma = "inviato-lo-stesso:" + dc.message.orEmpty()
                else if (dc != null && cosa == "inviato-accetta") conferma = "accetta-lo-stesso:" + dc.message.orEmpty()
                else avvisi.mostra(spiegaErrore2(e, "Non è riuscito: riprova"))
            }
            inCorso = null
        }
    }

    fun pdf(incarico: Boolean, condividi: Boolean) {
        if (inCorso != null) return
        inCorso = "pdf"
        avvisi.mostra("Preparo il PDF…")
        ambitoPreventivi.launch {
            try {
                val modello = perModello(dettagli[id] ?: p)
                val f = if (incarico) Stampa.incarico(ctx, modello, dati.anagrafichePerStampa()) { dati.file(it) }
                else Stampa.preventivo(ctx, modello, dati.anagrafichePerStampa()) { dati.file(it) }
                avvisi.chiudi()
                if (condividi) Stampa.condividi(ctx, f, (if (incarico) "Incarico " else "Preventivo ") + p.numero)
                else if (!Stampa.apri(ctx, f)) avvisi.mostra("Sul telefono non c'è un'app per i PDF: usa Condividi")
            } catch (e: Exception) {
                avvisi.mostra(spiegaErrore2(e, "Il PDF non si è creato. Riprova."))
            } finally {
                inCorso = null
            }
        }
    }

    fun creaCommessa() = fai("commessa", { dati.creaCommessaDaPreventivo(p.id) }) { r ->
        val m = r as eu.stgm.wisper.rapportino.Commessa
        val n = dati.anagrafiche.value.prestazioniDi(m.id).size
        RicordoCommesse.schede[m.id] = SchedaDiCommessa.PRESTAZIONI
        avvisi.mostra("Commessa ${m.id} creata" + if (n > 0) " con ${Testo.quanti(n, "prestazione", "prestazioni")}" else "")
        nav.vai("commessa/${m.id}")
    }

    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = SpazioSottoBarra),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Testata(onIndietro = { nav.indietro() }) {
                PulsanteTondo(Icone.altro, "Altre azioni", { if (inCorso == null) menu = true })
            }
            // ---- la testa: numero, stato, scadenza, oggetto, cliente, i passi
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    PillolaNumero(etichettaDi(p))
                    if (!p.modello) ParolaStatoPreventivo(stato)
                    scadenzaDi(p, oggi)?.let { Text(it, style = Testi.secondario, color = c.tenue, modifier = Modifier.align(Alignment.CenterVertically)) }
                }
                Text(p.oggetto.ifBlank { "Senza oggetto" }, style = Testi.titoloPagina.copy(fontSize = 26.sp, lineHeight = 30.sp), color = c.testo)
                val sotto = listOfNotNull(nomeClienteDi(p, ana).takeIf { !p.modello }, p.data?.let { "del " + giornoBreve(it) })
                if (sotto.isNotEmpty()) Text(sotto.joinToString(" · "), style = Testi.secondarioGrande, color = c.tenue)
                if (!p.modello) PassiPreventivo(stato)
            }

            // ---- accettato, rifiutato: chi, quando, come
            if (p.stato == StatoPreventivo.ACCETTATO && p.accettatoDa.isNotBlank()) {
                val modo = when (p.accettazioneModo) { "firma" -> "firmato sul telefono"; "email" -> "per email"; "documento" -> "col documento firmato"; "voce" -> "a voce"; else -> "" }
                RigaInformazione(
                    Icone.spunta, c.firmatoTesto, c.firmatoFondo,
                    "Accettato da ${p.accettatoDa}",
                    listOfNotNull(istanteLocale(p.accettatoIl)?.toLocalDate()?.let { "il " + giornoBreve(it) }, modo.ifBlank { null }).joinToString(" · "),
                )
            }
            if (p.stato == StatoPreventivo.RIFIUTATO) {
                RigaInformazione(
                    Icone.chiudi, c.rossoTesto, c.rossoTenue,
                    "Rifiutato" + (istanteLocale(p.rifiutatoIl)?.toLocalDate()?.let { " il " + giornoBreve(it) } ?: ""),
                    p.motivoRifiuto.ifBlank { "Senza motivo" },
                )
            }

            // ---- fase 7 (§12.6): nel portale, accettato nel portale con la firma e la prova, Manda anche un WhatsApp
            if (!p.modello) BloccoPortalePreventivo(dati, p)

            // ---- le sezioni con le voci
            if (!completo && p.sezioni.isEmpty()) {
                if (errore != null) Scheda(orizzontale = 20.dp, verticale = 18.dp) {
                    Text(errore!!, style = Testi.testo, color = c.testo2)
                    PulsanteBordo("Riprova", { giro++ }, Modifier.fillMaxWidth(), icona = Icone.riapri)
                } else { Segnaposto(150.dp); Segnaposto(110.dp) }
            }
            p.sezioni.forEach { s -> SezioneLettura(s, costi) }

            // ---- il conto
            if (costi && (completo || p.sezioni.isNotEmpty())) SchedaConto(p, k)

            // ---- cosa chiede la legge
            if (!p.modello && (completo || p.sezioni.isNotEmpty())) {
                SchedaLegge(
                    ContiPreventivo.legge(p, ana.impostazioni),
                    onSistema = { chiave ->
                        when (chiave) {
                            "polizza", "titoli" -> if (perm.vede(Moduli.AMMINISTRAZIONE)) nav.vai("amm/studio")
                            else -> if (puo && p.bozza) nav.vai("preventivo-modifica/${p.id}/" + (if (chiave == "prezzi") 2 else 3) + "/0")
                        }
                    },
                )
            }

            // ---- i pagamenti
            if (p.scadenzePagamento.isNotEmpty()) {
                Scheda(orizzontale = 18.dp, verticale = 16.dp, spazio = 8.dp) {
                    Etichetta("Pagamenti")
                    p.scadenzePagamento.forEach { s ->
                        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(s.descrizione.ifBlank { pagamentoAParole(s) }, style = Testi.secondarioGrande.copy(fontWeight = FontWeight.Bold), color = c.testo)
                                Text(quandoPagare(s), style = Testi.piccolo, color = c.tenue)
                            }
                            if (costi) Text(Numeri.euro(ContiPreventivo.importoScadenza(s, k.imponibile)), style = Testi.secondarioGrande.copy(fontWeight = FontWeight.Bold), color = c.testo)
                        }
                    }
                }
            }

            // ---- oneri e condizioni
            if (p.oneriPrevisti.isNotBlank() || p.condizioni.isNotBlank()) {
                Scheda(orizzontale = 18.dp, verticale = 16.dp, spazio = 8.dp) {
                    if (p.oneriPrevisti.isNotBlank()) {
                        Etichetta("Oneri previsti")
                        Text(p.oneriPrevisti, style = Testi.testo, color = c.testo2)
                    }
                    if (p.condizioni.isNotBlank()) {
                        Etichetta("Condizioni")
                        Text(p.condizioni, style = Testi.testo, color = c.testo2)
                    }
                }
            }

            // ---- il PDF e le revisioni
            SchedaElenco {
                RigaVoce("PDF del preventivo", sotto = "Come lo riceve il cliente", icona = Icone.pdf, onClick = { pdf(incarico = false, condividi = false) })
                if (p.stato == StatoPreventivo.ACCETTATO) {
                    LineaElenco()
                    RigaVoce("Incarico professionale", sotto = "Dal preventivo accettato, con le condizioni e la firma", icona = Icone.firma, onClick = { pdf(incarico = true, condividi = false) })
                }
            }
            if (p.revisioni.size > 1) {
                Etichetta("Revisioni")
                SchedaElenco {
                    p.revisioni.sortedByDescending { it.revisione }.forEachIndexed { i, r ->
                        if (i > 0) LineaElenco()
                        val questa = r.id == p.id
                        RigaVoce(
                            if (r.revisione > 0) "Revisione ${r.revisione}" else "Prima versione",
                            sotto = listOfNotNull(r.data?.let { "del " + giornoBreve(it) }, if (questa) "questa" else null).joinToString(" · ").ifBlank { null },
                            valore = if (costi) r.totale?.let { Numeri.euro(it) } else null,
                            fine = { ParolaStatoPreventivo(r.stato) },
                            freccia = !questa,
                            onClick = if (questa) null else ({ nav.vai("preventivo/${r.id}") }),
                        )
                    }
                }
            }
            if (p.idCommessa.isNotBlank() && perm.vede(Moduli.COMMESSE)) {
                SchedaElenco {
                    RigaVoce("Commessa ${p.idCommessa}", sotto = ana.commessa(p.idCommessa)?.descrizione, icona = Icone.commesse, onClick = { nav.vai("commessa/${p.idCommessa}") })
                }
            }
            if (p.noteInterne.isNotBlank() && puo) {
                Scheda(orizzontale = 18.dp, verticale = 16.dp, spazio = 6.dp) {
                    Etichetta("Note per te")
                    Text(p.noteInterne, style = Testi.testo, color = c.testo2)
                }
            }
        }

        // ---- UN pulsante giallo secondo lo stato
        val giallo: Pair<String, () -> Unit>? = when {
            inCorso == "commessa" -> "Creo la commessa…" to {}
            p.modello && puo -> "Usa questo modello" to { usaModello(dati, nav, p, avvisi) }
            !puo && p.idCommessa.isNotBlank() && perm.vede(Moduli.COMMESSE) -> "Apri la commessa ${p.idCommessa}" to { nav.vai("commessa/${p.idCommessa}") }
            !puo -> null
            p.bozza -> "Invia al cliente" to { nav.vai("invio/preventivo/${p.id}") }
            stato == StatoPreventivo.INVIATO || stato == StatoPreventivo.SCADUTO -> "Segna accettato" to { accetta = true }
            p.stato == StatoPreventivo.ACCETTATO && p.idCommessa.isBlank() && perm.modifica(Moduli.COMMESSE) -> "Crea la commessa" to { creaCommessa() }
            p.idCommessa.isNotBlank() && perm.vede(Moduli.COMMESSE) -> "Apri la commessa ${p.idCommessa}" to { nav.vai("commessa/${p.idCommessa}") }
            else -> null
        }
        if (giallo != null) {
            FondoConPulsante(Modifier.align(Alignment.BottomCenter)) {
                PulsantePrincipale(
                    giallo.first, giallo.second,
                    icona = when { p.bozza && !p.modello -> Icone.invia; giallo.first == "Segna accettato" -> Icone.spunta; else -> null },
                    abilitato = inCorso == null || inCorso == "pdf",
                )
            }
        }
    }

    // ---- il menu ⋯
    if (menu) {
        FoglioDalBasso({ menu = false }) {
            Text("Altre azioni", style = Testi.titoloScheda, color = c.testo)
            if (puo && (p.bozza || p.modello)) VoceMenu(Icone.matita, "Modifica", { menu = false; nav.vai("preventivo-modifica/${p.id}/1/0") })
            if (puo && !p.modello && (stato == StatoPreventivo.INVIATO || stato == StatoPreventivo.SCADUTO)) {
                VoceMenu(Icone.copia, "Nuova revisione", { menu = false; conferma = "revisione" })
            }
            if (puo && !p.modello && p.stato == StatoPreventivo.RIFIUTATO) VoceMenu(Icone.riapri, "Riapri", { menu = false; conferma = "riapri" })
            if (puo && !p.modello) VoceMenu(Icone.copia, "Duplica", {
                menu = false
                fai("duplica", { dati.duplicaPreventivo(p.id, false) }) { r -> val n = r as Preventivo; avvisi.mostra("Creato ${n.numero}"); nav.vai("preventivo/${n.id}") }
            })
            if (puo && !p.modello) VoceMenu(Icone.copia, "Duplica come modello", {
                menu = false
                fai("modello", { dati.duplicaPreventivo(p.id, true) }) { avvisi.mostra("Modello pronto: lo trovi in Nuovo preventivo") }
            })
            if (puo && p.bozza && !p.modello) VoceMenu(Icone.invia, "Segna inviato senza email", { menu = false; conferma = "inviato" })
            // L'accettazione vale per un preventivo inviato (§13.5): firmando sul posto una bozza, prima si segna inviata.
            if (puo && p.bozza && !p.modello) VoceMenu(Icone.firma, "Il cliente accetta adesso", {
                menu = false
                fai("inviato-accetta", { dati.segnaInviato(p.id) }) { accetta = true }
            })
            if (puo && !p.modello && (stato == StatoPreventivo.INVIATO || stato == StatoPreventivo.SCADUTO)) {
                VoceMenu(Icone.chiudi, "Rifiutato", { menu = false; motivo = ""; conferma = "rifiuta" })
            }
            if (!p.modello && !p.bozza && p.idCliente.isNotBlank()) {
                val info = portaleDi(p)
                VociPortale(dati, info, InCoda7.portaleInCoda("preventivo", p.id, info?.id.orEmpty(), ops),
                    puoPubblicare = p.stato in setOf(StatoPreventivo.INVIATO, StatoPreventivo.ACCETTATO, StatoPreventivo.RIFIUTATO), onPubblica = { pubblica = true }, onFatto = { menu = false })
            }
            VoceMenu(Icone.pdf, "PDF", { menu = false; pdf(incarico = false, condividi = false) })
            VoceMenu(Icone.condividi, "Condividi il PDF", { menu = false; pdf(incarico = false, condividi = true) })
            if (p.stato == StatoPreventivo.ACCETTATO) VoceMenu(Icone.firma, "PDF dell'incarico", { menu = false; pdf(incarico = true, condividi = false) })
        }
    }
    FoglioPubblicaSe(dati, pubblica, "preventivo", p.id, p.idCliente, nomeClienteDi(p, ana)) { pubblica = false; giro++ }

    // ---- le conferme
    when (val cf = conferma) {
        "revisione", "riapri" -> FoglioConferma(
            if (cf == "riapri") "Riaprire il preventivo?" else "Fare una nuova revisione?",
            "La ${etichettaDi(p).substringAfter(" · ", "prima versione")} resta da consultare. La nuova è una bozza da cambiare e rimandare.",
            if (cf == "riapri") "Riapri" else "Nuova revisione",
            onConferma = {
                conferma = null
                fai("revisione", { if (cf == "riapri") dati.riapriPreventivo(p.id) else dati.nuovaRevisione(p.id) }) { r ->
                    val n = r as Preventivo
                    avvisi.mostra("Revisione ${n.revisione} in bozza")
                    nav.vai("preventivo-modifica/${n.id}")
                }
            },
            onAnnulla = { conferma = null },
        )
        "inviato" -> FoglioConferma(
            "Segnare inviato senza email?", "Per quando l'hai mandato in un altro modo. Dopo, i prezzi non si cambiano più: si fa una revisione.", "Segna inviato",
            onConferma = { conferma = null; fai("inviato", { dati.segnaInviato(p.id) }) { avvisi.mostra("Segnato inviato") } },
            onAnnulla = { conferma = null },
        )
        "rifiuta" -> FoglioDalBasso({ conferma = null }) {
            Text("Segnare rifiutato?", style = Testi.titoloScheda, color = c.testo)
            CampoTesto(motivo, { motivo = it }, "Perché", segnaposto = "Per esempio: ha scelto un altro studio", righe = 2)
            PulsantePrincipale("Segna rifiutato", {
                conferma = null
                fai("rifiuta", { dati.rifiutaPreventivo(p.id, motivo) }) { avvisi.mostra("Segnato rifiutato") }
            }, altezza = 56.dp)
            PulsanteTesto("Annulla", { conferma = null }, Modifier.fillMaxWidth(), colore = c.testo)
        }
        null -> {}
        else -> if (cf.startsWith("accetta-lo-stesso:")) FoglioConferma(
            "Manca qualcosa per la legge", cf.removePrefix("accetta-lo-stesso:"), "Continua lo stesso",
            onConferma = { conferma = null; fai("inviato-accetta2", { dati.segnaInviato(p.id, conferma = true) }) { accetta = true } },
            onAnnulla = { conferma = null },
        ) else if (cf.startsWith("inviato-lo-stesso:")) FoglioConferma(
            "Manca qualcosa per la legge", cf.removePrefix("inviato-lo-stesso:"), "Segna inviato lo stesso",
            onConferma = { conferma = null; fai("inviato2", { dati.segnaInviato(p.id, conferma = true) }) { avvisi.mostra("Segnato inviato") } },
            onAnnulla = { conferma = null },
        )
    }

    if (accetta) FoglioAccetta(dati, nav, dettagli[id] ?: p, ana, costi) { accetta = false }
}

/** I passi del preventivo: Bozza → Inviato → Accettato, quello di adesso in giallo. */
@Composable
private fun PassiPreventivo(stato: String) {
    val c = W.colori
    val passi = listOf("Bozza", "Inviato", "Accettato")
    val at = when (stato) {
        StatoPreventivo.BOZZA -> 0
        StatoPreventivo.ACCETTATO -> 2
        else -> 1
    }
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        passi.forEachIndexed { i, nome ->
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Box(
                    Modifier.size(22.dp).clip(CircleShape).background(if (i < at) c.testo else if (i == at) c.giallo else c.superficie2),
                    contentAlignment = Alignment.Center,
                ) {
                    if (i < at) Icon(Icone.spunta, null, tint = c.foglio, modifier = Modifier.size(13.dp))
                    else Text("${i + 1}", style = Testi.pillola.copy(fontWeight = FontWeight.ExtraBold), color = c.suGiallo)
                }
                Text(nome, style = Testi.piccolo.copy(fontWeight = FontWeight.ExtraBold), color = if (i <= at) c.testo else c.moltoTenue)
            }
            if (i < passi.lastIndex) Box(Modifier.width(18.dp).height(2.dp).background(c.superficie2))
        }
    }
}

/** Una riga che dice com'è andata (accettato, rifiutato): icona colorata, titolo, dettaglio. */
@Composable
private fun RigaInformazione(icona: androidx.compose.ui.graphics.vector.ImageVector, tinta: androidx.compose.ui.graphics.Color, fondo: androidx.compose.ui.graphics.Color, titolo: String, sotto: String) {
    val c = W.colori
    Scheda(orizzontale = 16.dp, verticale = 14.dp) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(fondo), contentAlignment = Alignment.Center) {
                Icon(icona, null, tint = tinta, modifier = Modifier.size(20.dp))
            }
            Column(Modifier.weight(1f)) {
                Text(titolo, style = Testi.forte, color = c.testo)
                if (sotto.isNotBlank()) Text(sotto, style = Testi.secondario, color = c.tenue)
            }
        }
    }
}

/** Una sezione in lettura: titolo e subtotale sopra, le voci in una scheda; quelle che non contano velate. */
@Composable
internal fun SezioneLettura(s: eu.stgm.wisper.rapportino.SezionePreventivo, costi: Boolean) {
    val c = W.colori
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(Modifier.fillMaxWidth()) {
            Etichetta(s.titolo.ifBlank { "Prestazioni" }, Modifier.weight(1f))
            if (costi) Etichetta(Numeri.euro(ContiPreventivo.subtotale(s)))
        }
        SchedaElenco {
            if (s.voci.isEmpty()) RigaCalma("Nessuna voce")
            s.voci.forEachIndexed { i, v ->
                if (i > 0) LineaElenco()
                RigaVoceLettura(v, costi)
            }
        }
    }
}

@Composable
internal fun RigaVoceLettura(v: VocePreventivo, costi: Boolean, onClick: (() -> Unit)? = null) {
    val c = W.colori
    val conta = ContiPreventivo.conta(v)
    Row(
        Modifier.fillMaxWidth().heightIn(min = 64.dp).let { if (onClick != null) it.clickable(onClick = onClick) else it }
            .padding(vertical = 12.dp).alpha(if (conta) 1f else 0.55f),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(v.descrizione.ifBlank { "Senza descrizione" }, style = Testi.forte, color = c.testo, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text(v.dettaglio(costi), style = Testi.secondario, color = c.tenue)
            when {
                v.inAlternativa -> Pillolina(if (v.scelta) "Una di queste: scelta" else "Una di queste", c.inviatoTesto, c.inviatoFondo, Modifier.padding(top = 4.dp))
                v.facoltativa -> Pillolina(if (v.scelta) "Facoltativa, scelta" else "Facoltativa", c.gialloTesto, c.gialloTenue, Modifier.padding(top = 4.dp))
            }
        }
        if (costi) {
            if (v.prezzo == null || v.prezzo <= 0.0) Text("senza prezzo", style = Testi.secondarioGrande.copy(fontWeight = FontWeight.Bold), color = c.gialloTesto)
            else Text(Numeri.euro(ContiPreventivo.importoVoce(v)), style = Testi.secondarioGrande.copy(fontWeight = FontWeight.ExtraBold), color = c.testo, maxLines = 1)
        }
        if (onClick != null) Icon(Icone.freccia, null, tint = c.moltoTenue, modifier = Modifier.size(18.dp))
    }
}

/** Il conto: imponibile, contributo EPPI, IVA, e il totale grande (prototipo, "Il conto"). */
@Composable
internal fun SchedaConto(p: Preventivo, k: ContoPreventivo) {
    val c = W.colori
    Scheda(orizzontale = 18.dp, verticale = 18.dp, spazio = 8.dp) {
        Etichetta("Il conto")
        if (k.scontoPercentuale > 0 || k.scontoEuro > 0) {
            RigaConto("Prestazioni", Numeri.euro(k.somma))
            if (k.scontoPercentuale > 0) RigaConto("Sconto ${Numeri.scrivi(p.scontoPercentuale)}%", "−" + Numeri.euro(k.scontoPercentuale))
            if (k.scontoEuro > 0) RigaConto("Sconto", "−" + Numeri.euro(k.scontoEuro))
        }
        RigaConto("Imponibile", Numeri.euro(k.imponibile))
        RigaConto("Contributo integrativo EPPI ${Numeri.scrivi(p.eppiPercentuale ?: 5.0)}%", Numeri.euro(k.contributo))
        RigaConto("IVA ${Numeri.scrivi(p.ivaPercentuale ?: 22.0)}%", Numeri.euro(k.iva))
        LineaElenco()
        Row(Modifier.fillMaxWidth().padding(top = 4.dp), verticalAlignment = Alignment.Bottom) {
            Text("Totale", style = Testi.forteGrande, color = c.testo, modifier = Modifier.weight(1f).alignByBaseline())
            EuroAnimati(k.totale, Testi.numeroGrande.copy(letterSpacing = (-0.5).sp), Modifier.alignByBaseline())
        }
    }
}

/** "Cosa chiede la legge": una riga per cosa, la spunta verde o "manca" in giallo scuro (si tocca per sistemarla). */
@Composable
internal fun SchedaLegge(righe: List<eu.stgm.wisper.rapportino.RichiestaLegge>, onSistema: ((String) -> Unit)? = null) {
    val c = W.colori
    Scheda(orizzontale = 18.dp, verticale = 16.dp, spazio = 2.dp) {
        Etichetta("Cosa chiede la legge", Modifier.padding(bottom = 6.dp))
        righe.forEach { r ->
            Row(
                Modifier.fillMaxWidth().heightIn(min = 40.dp).clip(RoundedCornerShape(10.dp))
                    .let { if (!r.ok && onSistema != null) it.clickable { onSistema(r.chiave) } else it },
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Icon(if (r.ok) Icone.spunta else Icone.allarme, null, tint = if (r.ok) c.firmatoTesto else c.gialloTesto, modifier = Modifier.size(18.dp))
                Text(
                    r.nome + if (r.ok) "" else ": manca", style = Testi.secondarioGrande.copy(fontWeight = FontWeight.Bold),
                    color = if (r.ok) c.testo2 else c.gialloTesto, modifier = Modifier.weight(1f),
                )
                if (!r.ok && onSistema != null) Icon(Icone.freccia, null, tint = c.collegamento, modifier = Modifier.size(16.dp))
            }
        }
    }
}

internal fun quandoPagare(s: ScadenzaPagamento): String =
    if (s.quando == ScadenzaPagamento.DATA && s.data != null) "il " + giornoBreve(s.data) else ScadenzaPagamento.nomeQuando(s.quando)

internal fun pagamentoAParole(s: ScadenzaPagamento): String =
    (if (s.tipo == ScadenzaPagamento.IMPORTO) Numeri.euro(s.valore) else Numeri.scrivi(s.valore) + "%") + " " + quandoPagare(s)

// ---------------------------------------------------------------------------------- accettazione

/**
 * "Come ha accettato?" (fase2.md §5): firma qui, email, documento firmato, a voce;
 * le facoltative e le alternative da spuntare, il totale che si aggiorna; poi la
 * firma come per il rapportino, o "Segna accettato".
 */
@Composable
private fun FoglioAccetta(dati: Dati, nav: Navigatore, p: Preventivo, ana: Anagrafiche, costi: Boolean, onChiudi: () -> Unit) {
    val c = W.colori
    val ctx = LocalContext.current
    val avvisi = LocalAvvisi.current
    val modi = listOf("firma" to "Firma qui sul telefono", "email" to "Ha risposto per email", "documento" to "Ho il documento firmato", "voce" to "A voce")
    var modo by remember { mutableStateOf("firma") }
    var voci by remember(p.id) { mutableStateOf(p.voci.map { it.copy(contaServer = null) }) }
    val referente = ana.referentiDi(p.idCliente).firstOrNull { it.id == p.idReferente }
    var nome by remember { mutableStateOf(referente?.nome.orEmpty()) }
    var erroreNome by remember { mutableStateOf<String?>(null) }
    var documento by remember { mutableStateOf<Uri?>(null) }
    var salvo by remember { mutableStateOf(false) }
    val scegli = voci.filter { it.facoltativa || it.inAlternativa }
    val k = ContiPreventivo.calcola(p.conVoci(voci), ContiPreventivo.eppi(ana.impostazioni), ContiPreventivo.iva(ana.impostazioni))
    val scelte = scegli.filter { it.id.isNotBlank() }.associate { it.id to it.scelta }
    val prendiDocumento = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { u -> if (u != null) documento = u }

    fun conferma() {
        if (salvo) return
        if (modo == "firma") {
            FirmaPreventivoInAttesa.id = p.id
            FirmaPreventivoInAttesa.nome = nome.trim()
            FirmaPreventivoInAttesa.scelte = scelte
            onChiudi()
            nav.firmaPreventivo(p.id)
            return
        }
        if (nome.isBlank()) { erroreNome = "Scrivi chi ha accettato"; return }
        salvo = true
        ambitoPreventivi.launch {
            dati.accettaPreventivo(p.id, modo, nome.trim(), scelte, documento = documento)
                .onSuccess { onChiudi(); avvisi.mostra("Preventivo segnato accettato") }
                .onFailure { avvisi.mostra(spiegaErrore2(it, "Non è stato segnato: riprova")) }
            salvo = false
        }
    }

    FoglioDalBasso(onChiudi) {
        Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("Come ha accettato?", style = Testi.titoloScheda, color = c.testo)
            modi.forEach { (m, nomeModo) -> SceltaGrande(nomeModo, modo == m, { modo = m }) }
            if (scegli.isNotEmpty()) {
                Etichetta("Cosa ha scelto", Modifier.padding(top = 6.dp))
                scegli.forEach { v ->
                    SceltaGrande(
                        v.descrizione, v.scelta, { voci = ContiPreventivo.tocca(voci, v.id) },
                        sotto = (if (v.facoltativa && !v.inAlternativa) "Facoltativa" else "Una di queste") +
                            if (costi && v.prezzo != null) " · " + Numeri.euro(ContiPreventivo.importoVoce(v)) else "",
                        casella = v.facoltativa && !v.inAlternativa,
                    )
                }
            }
            if (modo != "firma") {
                CampoTesto(nome, { nome = it; erroreNome = null }, "Chi ha accettato", errore = erroreNome)
            }
            if (modo == "documento") {
                val nomeDoc = documento?.let { u -> runCatching { ctx.contentResolver.query(u, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cur -> if (cur.moveToFirst()) cur.getString(0) else null } }.getOrNull() }
                PulsanteBordo(nomeDoc ?: "Allega il documento firmato", { prendiDocumento.launch("*/*") }, Modifier.fillMaxWidth(), icona = Icone.graffetta, altezza = 48.dp)
            }
            if (costi) {
                Row(Modifier.fillMaxWidth().padding(horizontal = 2.dp, vertical = 4.dp), verticalAlignment = Alignment.Bottom) {
                    Text("Totale", style = Testi.forteGrande, color = c.testo, modifier = Modifier.weight(1f).alignByBaseline())
                    EuroAnimati(k.totale, Testi.numeroGrande.copy(fontSize = 26.sp), Modifier.alignByBaseline())
                }
            }
            PulsantePrincipale(
                when { salvo -> "Salvo…"; modo == "firma" -> "Fai firmare"; else -> "Segna accettato" },
                { conferma() }, icona = if (modo == "firma") Icone.firma else Icone.spunta, abilitato = !salvo,
            )
        }
    }
}

// ---------------------------------------------------------------------------------- contratti

/** I preventivi accettati con il loro incarico (fase2.md §5, Contratti). */
@Composable
fun SchermataContratti(dati: Dati, nav: Navigatore) {
    val c = W.colori
    val ctx = LocalContext.current
    val avvisi = LocalAvvisi.current
    val perm = LocalPermessi.current
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    val tutti by dati.preventivi.collectAsStateWithLifecycle()
    var occupato by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { dati.aggiornaPreventivi() }
    val accettati = tutti.filter { it.stato == StatoPreventivo.ACCETTATO && !it.modello }
        .sortedByDescending { istanteLocale(it.accettatoIl) ?: it.data?.atStartOfDay() }

    fun incarico(p: Preventivo) {
        if (occupato) return
        occupato = true
        avvisi.mostra("Preparo l'incarico…")
        ambitoPreventivi.launch {
            try {
                val completo = dati.preventivo(p.id).getOrNull() ?: p
                val f = Stampa.incarico(ctx, perModello(completo), dati.anagrafichePerStampa()) { dati.file(it) }
                avvisi.chiudi()
                if (!Stampa.apri(ctx, f)) avvisi.mostra("Sul telefono non c'è un'app per i PDF")
            } catch (e: Exception) {
                avvisi.mostra(spiegaErrore2(e, "Il PDF non si è creato. Riprova."))
            } finally {
                occupato = false
            }
        }
    }

    Column(
        Modifier.fillMaxSize().background(c.fondo).verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = 40.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Testata(onIndietro = { nav.indietro() })
        TitoloPagina("Contratti")
        SchedaElenco {
            if (accettati.isEmpty()) RigaCalma("Nessun preventivo accettato")
            accettati.forEachIndexed { i, p ->
                if (i > 0) LineaElenco()
                RigaVoce(
                    p.oggetto,
                    sotto = listOfNotNull(etichettaDi(p).replace(" · ", " "), nomeClienteDi(p, ana), istanteLocale(p.accettatoIl)?.toLocalDate()?.let { "accettato il " + giornoBreve(it) })
                        .joinToString(" · "),
                    valore = if (perm.costi) Numeri.euro(totaleDi(p, ana)) else null,
                    fine = { PulsanteTondo(Icone.pdf, "PDF dell'incarico", { incarico(p) }, dimensione = 48.dp) },
                    freccia = false,
                    onClick = { nav.vai("preventivo/${p.id}") },
                )
            }
        }
    }
}
