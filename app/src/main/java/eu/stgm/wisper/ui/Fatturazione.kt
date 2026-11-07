@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class, androidx.compose.foundation.ExperimentalFoundationApi::class)

package eu.stgm.wisper.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import eu.stgm.wisper.Dati
import eu.stgm.wisper.rapportino.Conti
import eu.stgm.wisper.rapportino.DaFatturare
import eu.stgm.wisper.rapportino.Fattura
import eu.stgm.wisper.rapportino.FiltroFatture
import eu.stgm.wisper.rapportino.GruppoDaFatturare
import eu.stgm.wisper.rapportino.Moduli
import eu.stgm.wisper.rapportino.Ricevuta
import eu.stgm.wisper.rapportino.RiepilogoFatturato
import eu.stgm.wisper.rapportino.ScadenzaCommessa
import eu.stgm.wisper.rapportino.SceltaDaFatturare
import eu.stgm.wisper.rapportino.VoceDaFatturare
import eu.stgm.wisper.rapportino.dataBreve
import eu.stgm.wisper.rapportino.giornoParole
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.YearMonth

/*
 * 08 Fatturazione sul telefono (fase4.md §13.2, prototipo Gestionale-fase4.html):
 * Da fatturare · Fatture · Ricevute · Riepilogo, con la fascia delle regole da
 * confermare. Davanti le cose da un minuto (scegliere e preparare la bozza,
 * importare l'XML, segnare l'incasso); il resto nel menu ⋯ o un livello sotto.
 */

enum class SegmentoFatture { DA_FATTURARE, FATTURE, RICEVUTE, RIEPILOGO }

/** I filtri dell'elenco delle fatture (§13.2): Da emettere · Da incassare · Scadute · Tutte. */
enum class FiltroElencoFatture(val nome: String) { DA_EMETTERE("Da emettere"), DA_INCASSARE("Da incassare"), SCADUTE("Scadute"), TUTTE("Tutte") }

object RicordoFatture {
    var segmento by mutableStateOf(SegmentoFatture.DA_FATTURARE)
    var filtro by mutableStateOf(FiltroElencoFatture.TUTTE)
    var giro by mutableIntStateOf(0)
    var scelte: Set<String> = emptySet()

    /** Dalla Dashboard: l'elenco col filtro giusto. */
    fun mostra(stato: String = "", pagamento: String = "", scadute: Boolean = false) {
        segmento = SegmentoFatture.FATTURE
        filtro = when {
            scadute -> FiltroElencoFatture.SCADUTE
            stato == "pronta" || stato == "bozza" || stato == "da_emettere" -> FiltroElencoFatture.DA_EMETTERE
            pagamento.isNotBlank() -> FiltroElencoFatture.DA_INCASSARE
            else -> FiltroElencoFatture.TUTTE
        }
    }
}

@Composable
fun SchermataFatturazione(dati: Dati, nav: Navigatore) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    val scrive = scriveFatture()
    val regole = regoleDi(dati)
    val vedeAmm = LocalPermessi.current.vede(Moduli.AMMINISTRAZIONE)
    val seg = RicordoFatture.segmento
    var menu by remember { mutableStateOf(false) }
    var lettura by remember { mutableStateOf<DaFatturare?>(null) }
    var scelte by remember { mutableStateOf(RicordoFatture.scelte) }
    var raggruppa by remember { mutableStateOf<String?>(null) }
    var preparo by remember { mutableStateOf(false) }
    val ctx = LocalContext.current
    val esporta: (String, List<Pair<String, String>>, String) -> Unit = { cosa, p, titolo ->
        avvisi.mostra("Preparo il file…")
        scope.launch {
            dati.fase4.esporta(cosa, p).onSuccess { condividiFile(ctx, it, titolo, "text/csv") }.onFailure { avvisi.mostra(spiegaErrore2(it, "Il file non si è preparato: riprova")) }
        }
    }

    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).padding(top = 10.dp, bottom = 130.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            TestataMenu { PulsanteTondo(Icone.altro, "Altre azioni", { menu = true }) }
            TitoloPagina("Fatturazione")
            if (!regole.confermate) FasciaRegole(if (vedeAmm) ({ nav.vai("amm/fiscale") }) else null)
            SegmentiScorrevoli(
                listOf(SegmentoFatture.DA_FATTURARE to "Da fatturare", SegmentoFatture.FATTURE to "Fatture", SegmentoFatture.RICEVUTE to "Ricevute", SegmentoFatture.RIEPILOGO to "Riepilogo"),
                seg, { RicordoFatture.segmento = it },
            )
            when (seg) {
                SegmentoFatture.DA_FATTURARE -> PaginaDaFatturare(dati, nav, scrive, scelte, raggruppa, onLetto = { lettura = it }, onScelte = { s, a -> scelte = s; RicordoFatture.scelte = s; a?.let(avvisi::mostra) }, onRaggruppa = { raggruppa = it })
                SegmentoFatture.FATTURE -> PaginaElencoFatture(dati, nav)
                SegmentoFatture.RICEVUTE -> PaginaRicevute(dati, nav)
                SegmentoFatture.RIEPILOGO -> PaginaRiepilogo(dati, esporta)
            }
        }
        if (scrive) {
            when (seg) {
                SegmentoFatture.DA_FATTURARE -> {
                    val tutte = lettura?.tutte.orEmpty()
                    val presenti = scelte.filter { k -> tutte.any { it.chiave == k } }.toSet()
                    val totale = SceltaDaFatturare.totale(presenti, tutte)
                    FondoConPulsante(Modifier.align(Alignment.BottomCenter)) {
                        PulsantePrincipale(
                            if (preparo) "Preparo la bozza…" else if (presenti.isEmpty()) "Prepara la bozza" else "Prepara la bozza · " + euro(totale),
                            {
                                val idCliente = SceltaDaFatturare.cliente(presenti, tutte)
                                if (preparo) return@PulsantePrincipale
                                if (presenti.isEmpty() || idCliente == null) { avvisi.mostra("Scegli almeno una cosa da fatturare"); return@PulsantePrincipale }
                                preparo = true
                                scope.launch {
                                    val rag = raggruppa ?: lettura?.raggruppa?.get(idCliente)
                                    dati.fase4.preparaFattura(idCliente, tutte.filter { it.chiave in presenti }, rag)
                                        .onSuccess { f ->
                                            scelte = emptySet(); RicordoFatture.scelte = emptySet(); raggruppa = null
                                            RicordoFatture.giro++
                                            avvisi.mostra("Bozza ${f.riferimento} pronta: controllala")
                                            nav.vai("fattura/${f.id}")
                                        }
                                        .onFailure { avvisi.mostra(spiegaErrore2(it, "La bozza non si è preparata: riprova")); RicordoFatture.giro++ }
                                    preparo = false
                                }
                            },
                            Modifier.bersaglio("prepara-bozza"), abilitato = presenti.isNotEmpty() && !preparo, icona = Icone.fatturazione,
                        )
                    }
                }
                SegmentoFatture.FATTURE, SegmentoFatture.RICEVUTE -> FondoConPulsante(Modifier.align(Alignment.BottomCenter)) {
                    PulsantePrincipale("Importa l'XML", { nav.vai("fatture-importa") }, icona = Icone.carica)
                }
                SegmentoFatture.RIEPILOGO -> {}
            }
        }
    }

    if (menu) {
        FoglioDalBasso({ menu = false }) {
            Text("Altre azioni", style = Testi.titoloScheda, color = c.testo)
            if (scrive) {
                VoceMenu(Icone.carica, "Importa l'XML delle fatture", { menu = false; nav.vai("fatture-importa") })
                VoceMenu(Icone.piu, "Nuova fattura con righe libere", { menu = false; nav.vai("fattura-nuova") })
            }
            VoceMenu(Icone.lista, "Scadenze di pagamento delle commesse", { menu = false; nav.vai("fatture-scadenze") })
            VoceMenu(Icone.scarica, "Esporta le fatture", { menu = false; esporta("fatture", emptyList(), "Le fatture") })
            VoceMenu(Icone.scarica, "Esporta le fatture ricevute", { menu = false; esporta("ricevute", emptyList(), "Le fatture ricevute") })
            VoceMenu(Icone.scarica, "Esporta cosa c'è da fatturare", { menu = false; esporta("daFatturare", emptyList(), "Da fatturare") })
        }
    }
}

// ---------------------------------------------------------------------------------- da fatturare

private var storicoLettoDaFatturare = 0L

@Composable
private fun PaginaDaFatturare(
    dati: Dati,
    nav: Navigatore,
    scrive: Boolean,
    scelte: Set<String>,
    raggruppa: String?,
    onLetto: (DaFatturare) -> Unit,
    onScelte: (Set<String>, String?) -> Unit,
    onRaggruppa: (String?) -> Unit,
) {
    val c = W.colori
    var giro by remember { mutableIntStateOf(0) }
    val lettura = rememberLettura(Unit, giro + RicordoFatture.giro * 1000) { dati.fase4.daFatturare() }
    val dashboard by dati.dashboard.collectAsStateWithLifecycle()
    var fuori by remember { mutableStateOf<VoceDaFatturare?>(null) }
    var piuAvanti by remember { mutableStateOf(false) }
    // I rapportini dei mesi prima servono a Prepara riepilogo: si rileggono tutti, al massimo ogni 5 minuti.
    LaunchedEffect(Unit) { if (System.currentTimeMillis() - storicoLettoDaFatturare > 5 * 60_000L) { storicoLettoDaFatturare = System.currentTimeMillis(); dati.aggiornaStorico() } }
    when (lettura) {
        is Lettura.InCorso -> { Segnaposto(90.dp); Segnaposto(220.dp) }
        is Lettura.Errore -> SchedaErrore(lettura.messaggio) { giro++ }
        is Lettura.Pronta -> {
            val d = lettura.dato
            LaunchedEffect(d) { onLetto(d) }
            val tutte = d.tutte
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                RiquadroEuro("Da fatturare", d.totale, Modifier.weight(1f))
                RiquadroEuro("In bozza", d.inBozza.sumOf { it.totale ?: 0.0 }, Modifier.weight(1f)) { RicordoFatture.mostra(stato = "da_emettere") }
                RiquadroEuro("Da incassare", dashboard?.fase4?.daIncassare, Modifier.weight(1f)) { RicordoFatture.mostra(pagamento = "aperta") }
            }
            if (d.gruppi.isEmpty()) Scheda(orizzontale = 18.dp, verticale = 16.dp) { RigaCalma("Niente di pronto da fatturare") }
            d.gruppi.forEach { g ->
                SchedaCliente(g, d, scelte, scrive, tutte, nav, raggruppa, onScelte, onRaggruppa, onFuori = { fuori = it })
            }
            if (d.piuAvanti.isNotEmpty()) {
                TitoloSezione("Più avanti", Testo.quanti(d.piuAvanti.size, "cosa", "cose"), if (piuAvanti) "Chiudi" else "Apri") { piuAvanti = !piuAvanti }
                if (piuAvanti) SchedaElenco {
                    d.piuAvanti.forEachIndexed { i, v ->
                        if (i > 0) LineaElenco()
                        RigaVoceDaFatturare(v, v.chiave in scelte, scrive, sotto = listOf(v.cliente, ScadenzaCommessa.quandoParole(v.quando, v.data)).filter { it.isNotBlank() }.joinToString(" · "),
                            onCambia = { val e = SceltaDaFatturare.cambia(scelte, v, tutte); onScelte(e.scelte, e.avviso) }, onLungo = { fuori = v })
                    }
                }
            }
            if (d.inBozza.isNotEmpty()) {
                TitoloSezione("In bozza")
                SchedaElenco {
                    d.inBozza.forEachIndexed { i, b ->
                        if (i > 0) LineaElenco()
                        RigaVoce(b.riferimento + " · " + b.cliente, sotto = if (b.voci > 0) Testo.quanti(b.voci, "cosa da fatturare", "cose da fatturare") else null, valore = euro(b.totale),
                            fine = { PillolaStato4(if (b.stato == "pronta") "Pronta" else "Bozza") }, freccia = false, onClick = { nav.vai("fattura/${b.idFattura}") })
                    }
                }
            }
            // 06/11/2026 (rapportino-lavori.md §3): sparisce "Da far firmare": i lavori da inviare si fatturano come gli altri.
        }
    }
    fuori?.let { v ->
        val scope = rememberCoroutineScope()
        val avvisi = LocalAvvisi.current
        val tutte = (lettura as? Lettura.Pronta)?.dato?.tutte.orEmpty()
        val insieme = SceltaDaFatturare.insieme(v, tutte).mapNotNull { k -> tutte.firstOrNull { it.chiave == k } }
        FoglioConferma(
            "Già fatturata fuori da Wisper",
            "Esce da Da fatturare senza fattura in Wisper: " + insieme.joinToString(", ") { it.titolo } + ".",
            "Segna fatturata fuori",
            onConferma = {
                fuori = null
                scope.launch {
                    dati.fase4.segnaFatturataFuori(insieme.filter { it.tipo != "spesa" || it.idRapportino.isBlank() }, "segnata dal telefono")
                        .onSuccess { avvisi.mostra("Segnata fatturata fuori da Wisper"); giro++ }
                        .onFailure { avvisi.mostra(spiegaErrore2(it, "Non è stata segnata: riprova")) }
                }
            },
            onAnnulla = { fuori = null },
        )
    }
}

/** Le ore all'italiana. */
internal object Numeri4 {
    fun ore(h: Double) = eu.stgm.wisper.rapportino.Numeri.ore(h)
}

/**
 * Una scheda per cliente (§13.2): cerchio, nome, totale, cose pronte, ritenuta, cosa
 * manca; dentro le voci con la casella, i rapportini di un mese come una voce che si
 * apre (con Prepara riepilogo).
 */
@Composable
private fun SchedaCliente(
    g: GruppoDaFatturare,
    d: DaFatturare,
    scelte: Set<String>,
    scrive: Boolean,
    tutte: List<VoceDaFatturare>,
    nav: Navigatore,
    raggruppa: String?,
    onScelte: (Set<String>, String?) -> Unit,
    onRaggruppa: (String?) -> Unit,
    onFuori: (VoceDaFatturare) -> Unit,
) {
    val c = W.colori
    var aperti by remember { mutableStateOf(setOf<String>()) }
    fun cambia(voci: List<VoceDaFatturare>) {
        val e = SceltaDaFatturare.cambia(scelte, voci, tutte)
        onScelte(e.scelte, e.avviso)
    }
    Scheda(orizzontale = 16.dp, verticale = 14.dp, spazio = 8.dp) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Iniziali(g.cliente, dimensione = 44.dp)
            Column(Modifier.weight(1f)) {
                Text(g.cliente, style = Testi.forteGrande, color = c.testo, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text(Testo.quanti(g.voci.count { it.pronta }, "cosa pronta", "cose pronte") + " · " + if (g.sostituto) "Ritenuta sì" else "Ritenuta no", style = Testi.secondario, color = c.tenue)
            }
            Text(euro(g.totale), style = Testi.titoloSezione, color = c.testo)
        }
        g.mancano.forEach { Text(it.testo, style = Testi.secondario.copy(fontWeight = FontWeight.Bold), color = c.gialloTesto) }
        // Le voci nell'ordine del server; i rapportini dello stesso mese stanno insieme.
        val visti = HashSet<String>()
        g.voci.forEach { v ->
            if (v.gruppo.startsWith("rapportini:") && (v.tipo == "rapportino" || v.idRapportino.isNotBlank())) {
                if (!visti.add(v.gruppo)) return@forEach
                val delMese = g.voci.filter { it.gruppo == v.gruppo && (it.tipo == "rapportino" || it.idRapportino.isNotBlank()) }
                val rap = delMese.filter { it.tipo == "rapportino" }
                val mese = runCatching { YearMonth.parse(v.gruppo.substringAfterLast(':')) }.getOrNull()
                val tutteScelte = delMese.all { it.chiave in scelte }
                val qualcuna = delMese.any { it.chiave in scelte }
                LineaElenco()
                Row(Modifier.fillMaxWidth().heightIn(min = 60.dp), verticalAlignment = Alignment.CenterVertically) {
                    if (scrive) CasellaScelta(tutteScelte, "Scegli i rapportini di ${mese?.let { Conti.nomeMese(it) } ?: ""}") { cambia(delMese) }
                    Column(Modifier.weight(1f).padding(start = 4.dp)) {
                        Text((mese?.let { Conti.nomeMese(it) } ?: "Rapportini") + " · " + Testo.quanti(rap.size, "rapportino", "rapportini"), style = Testi.forte, color = c.testo)
                        val riep = d.riepiloghi.firstOrNull { it.idCliente == g.idCliente && it.mese == mese?.toString() }
                        if (riep != null) Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            Icon(Icone.spunta, null, tint = c.firmatoTesto, modifier = Modifier.size(14.dp))
                            Text("Riepilogo inviato il " + dataBreve(riep.inviatoIl), style = Testi.secondario, color = c.firmatoTesto)
                        } else if (qualcuna && !tutteScelte) Text("Scelti in parte", style = Testi.secondario, color = c.gialloTesto)
                    }
                    Text(euro(eu.stgm.wisper.rapportino.RegoleFattura.centesimi(delMese.sumOf { it.importo })), style = Testi.forte, color = c.testo)
                    PulsanteTondo(if (v.gruppo in aperti) Icone.su else Icone.giu, if (v.gruppo in aperti) "Chiudi" else "Apri", { aperti = if (v.gruppo in aperti) aperti - v.gruppo else aperti + v.gruppo }, dimensione = 44.dp)
                }
                if (v.gruppo in aperti) {
                    delMese.forEach { r ->
                        RigaVoceDaFatturare(r, r.chiave in scelte, scrive, rientrata = true, onCambia = { cambia(listOf(r)) }, onLungo = { onFuori(r) })
                    }
                    if (mese != null && scrive) PulsanteBordo("Prepara riepilogo", { nav.vai("invio/cliente/${g.idCliente}/$mese") }, Modifier.fillMaxWidth(), icona = Icone.pdf, altezza = 48.dp)
                }
            } else {
                LineaElenco()
                RigaVoceDaFatturare(v, v.chiave in scelte, scrive, onCambia = { cambia(listOf(v)) }, onLungo = { onFuori(v) })
            }
        }
        // Come si raggruppano i rapportini scelti di questo cliente: lo si cambia solo se ce ne sono.
        val conRapportini = g.voci.any { it.tipo == "rapportino" && it.chiave in scelte }
        if (scrive && conRapportini) {
            val attuale = raggruppa ?: d.raggruppa[g.idCliente] ?: "rapportino"
            Segmenti(listOf("rapportino" to "Una riga per rapportino", "mese" to "Una riga per il mese"), attuale, { onRaggruppa(it) })
        }
    }
}

/** Una voce da fatturare: casella, titolo, dettaglio, importo; "Senza IVA" per le spese anticipate. Tocco lungo: già fatturata fuori. */
@Composable
private fun RigaVoceDaFatturare(
    v: VoceDaFatturare,
    scelta: Boolean,
    scrive: Boolean,
    rientrata: Boolean = false,
    sotto: String? = null,
    onCambia: () -> Unit,
    onLungo: () -> Unit,
) {
    val c = W.colori
    Row(
        Modifier.fillMaxWidth().heightIn(min = 56.dp)
            .combinedClickable(enabled = scrive, onClick = onCambia, onLongClick = onLungo)
            .padding(start = if (rientrata) 16.dp else 0.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (scrive) CasellaScelta(scelta, v.titolo, onCambia)
        Column(Modifier.weight(1f).padding(start = 4.dp, top = 6.dp, bottom = 6.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            val titolo = when (v.tipo) {
                "scadenza" -> v.titolo + if (v.idCommessa.isNotBlank()) " · ${v.idCommessa}" else ""
                "rapportino", "ticket" -> v.id + " · " + v.titolo
                else -> v.titolo
            }
            Text(titolo, style = Testi.forte.copy(fontWeight = FontWeight.Bold), color = c.testo, maxLines = 2, overflow = TextOverflow.Ellipsis)
            val riga = sotto ?: listOf(
                if (v.tipo == "scadenza") ScadenzaCommessa.quandoParole(v.quando, v.data) else if (v.data.isNotBlank()) dataBreve(v.data) else "",
                if (v.tipo == "scadenza") "" else v.dettaglio,
                if (v.senzaPrezzo) "senza prezzo" else "",
            ).filter { it.isNotBlank() }.joinToString(" · ")
            if (riga.isNotBlank()) Text(riga, style = Testi.secondario, color = c.tenue, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
        Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(euro(v.importo), style = Testi.secondarioGrande.copy(fontWeight = FontWeight.ExtraBold), color = c.testo)
            if (v.anticipazione) Pillolina("Senza IVA", c.fatturatoTesto, c.fatturatoFondo)
        }
    }
}

// ---------------------------------------------------------------------------------- fatture

@Composable
private fun PaginaElencoFatture(dati: Dati, nav: Navigatore) {
    val c = W.colori
    var testo by remember { mutableStateOf("") }
    var giro by remember { mutableIntStateOf(0) }
    val filtro = RicordoFatture.filtro
    val f = when (filtro) {
        FiltroElencoFatture.DA_EMETTERE -> FiltroFatture(stato = "da_emettere", testo = testo)
        FiltroElencoFatture.DA_INCASSARE -> FiltroFatture(pagamento = "aperta", testo = testo)
        FiltroElencoFatture.SCADUTE -> FiltroFatture(scadute = true, testo = testo)
        FiltroElencoFatture.TUTTE -> FiltroFatture(testo = testo)
    }
    val lettura = rememberLettura(f, giro + RicordoFatture.giro * 1000) { kotlinx.coroutines.delay(if (testo.isBlank()) 0 else 300); dati.fase4.fatture(f) }
    CampoCerca(testo, { testo = it }, "Cerca numero, cliente, causale")
    PilloleFiltro(FiltroElencoFatture.entries.map { it to it.nome }, filtro) { RicordoFatture.filtro = it }
    when (lettura) {
        is Lettura.InCorso -> Segnaposto(240.dp)
        is Lettura.Errore -> SchedaErrore(lettura.messaggio) { giro++ }
        is Lettura.Pronta -> SchedaElenco {
            if (lettura.dato.isEmpty()) RigaCalma(if (testo.isNotBlank()) "Nessuna fattura trovata" else "Nessuna fattura qui")
            lettura.dato.forEachIndexed { i, x ->
                if (i > 0) LineaElenco()
                RigaFatturaElenco(x) { nav.vai("fattura/${x.id}") }
            }
        }
    }
}

/** Una fattura nell'elenco: numero (o Rif. W-15 in grigio), cliente, data, netto, stato; le scadute con "da 12 giorni". */
@Composable
internal fun RigaFatturaElenco(x: Fattura, onClick: () -> Unit) {
    val c = W.colori
    Row(
        Modifier.fillMaxWidth().heightIn(min = 72.dp).clickableRiga(onClick).padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(if (x.nota) "Nota " + x.numero.ifBlank { x.riferimento } else x.numeroVisto, style = Testi.forte, color = if (x.numero.isBlank()) c.tenue else c.testo)
                Text(x.cliente, style = Testi.forte.copy(fontWeight = FontWeight.Bold), color = c.testo2, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
            }
            Text(
                listOf(dataBreve(x.data), if (x.scaduta) "da ${x.giorniScaduta} giorni" else "", if (x.residuo != null && x.pagamento == "in_parte") "restano " + euro(x.residuo) else "")
                    .filter { it.isNotBlank() }.joinToString(" · "),
                style = Testi.secondario, color = if (x.scaduta) c.rossoTesto else c.tenue,
            )
        }
        Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(euro(x.conti?.netto), style = Testi.forte, color = c.testo)
            PillolaStato4(if (x.nota && x.emessa) "Nota di credito" else x.statoVisto)
        }
    }
}

@Composable
private fun Modifier.clickableRiga(onClick: () -> Unit): Modifier = this.then(Modifier.combinedClickable(onClick = onClick))

// ---------------------------------------------------------------------------------- ricevute

@Composable
private fun PaginaRicevute(dati: Dati, nav: Navigatore) {
    val c = W.colori
    var soloDaPagare by remember { mutableStateOf(true) }
    var giro by remember { mutableIntStateOf(0) }
    val lettura = rememberLettura(soloDaPagare, giro + RicordoFatture.giro * 1000) { dati.fase4.ricevute(if (soloDaPagare) "da_pagare" else "tutte") }
    PilloleFiltro(listOf(true to "Da pagare", false to "Tutte"), soloDaPagare) { soloDaPagare = it }
    when (lettura) {
        is Lettura.InCorso -> Segnaposto(200.dp)
        is Lettura.Errore -> SchedaErrore(lettura.messaggio) { giro++ }
        is Lettura.Pronta -> SchedaElenco {
            if (lettura.dato.isEmpty()) RigaCalma("Nessuna fattura ricevuta da pagare")
            lettura.dato.forEachIndexed { i, r ->
                if (i > 0) LineaElenco()
                RigaRicevuta(r) { nav.vai("ricevuta/${r.id}") }
            }
        }
    }
}

@Composable
private fun RigaRicevuta(r: Ricevuta, onClick: () -> Unit) {
    val c = W.colori
    Row(Modifier.fillMaxWidth().heightIn(min = 72.dp).clickableRiga(onClick).padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(r.fornitore, style = Testi.forte, color = c.testo, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text(
                listOf("fattura " + r.numero, dataBreve(r.data), if (r.scadenza.isNotBlank() && (r.daPagare ?: 0.0) > 0) "scade il " + dataBreve(r.scadenza) else "", Ricevuta.nomeCategoria(r.categoria).takeIf { r.categoria.isNotBlank() } ?: "")
                    .filter { it.isNotBlank() }.joinToString(" · "),
                style = Testi.secondario, color = if (r.scaduta) c.rossoTesto else c.tenue,
            )
        }
        Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(euro(r.daPagare?.takeIf { it > 0 } ?: r.netto), style = Testi.forte, color = c.testo)
            PillolaStato4(r.statoVisto)
        }
    }
}

// ---------------------------------------------------------------------------------- riepilogo

@Composable
private fun PaginaRiepilogo(dati: Dati, esporta: (String, List<Pair<String, String>>, String) -> Unit) {
    val c = W.colori
    var anno by remember { mutableIntStateOf(LocalDate.now().year) }
    var per by remember { mutableStateOf("mese") }
    var giro by remember { mutableIntStateOf(0) }
    val lettura = rememberLettura(anno to per, giro) { dati.fase4.riepilogoFatturato(anno, per) }
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text("$anno", style = Testi.titoloScheda, color = c.testo, modifier = Modifier.weight(1f))
        PulsanteTondo(Icone.frecciaSinistra, "Anno prima", { anno-- })
        Spacer(Modifier.width(8.dp))
        PulsanteTondo(Icone.freccia, "Anno dopo", { if (anno < LocalDate.now().year) anno++ })
    }
    when (lettura) {
        is Lettura.InCorso -> Segnaposto(260.dp)
        is Lettura.Errore -> SchedaErrore(lettura.messaggio) { giro++ }
        is Lettura.Pronta -> {
            val r: RiepilogoFatturato = lettura.dato
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                RiquadroEuro("Fatturato nel $anno", r.fatturato, Modifier.weight(1f))
                RiquadroEuro("Incassato", r.incassato, Modifier.weight(1f))
            }
            Segmenti(listOf("mese" to "Mesi", "cliente" to "Clienti", "commessa" to "Commesse"), per, { per = it })
            SchedaElenco {
                val righe = if (per == "mese") r.righe.reversed() else r.righe
                if (righe.isEmpty()) RigaCalma("Nessuna fattura emessa")
                righe.forEachIndexed { i, x ->
                    if (i > 0) LineaElenco()
                    Row(Modifier.fillMaxWidth().heightIn(min = 56.dp).padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(x.nome.ifBlank { if (per == "commessa") "Più commesse o nessuna" else x.chiave }.replaceFirstChar { it.uppercase() }, style = Testi.forte, color = c.testo)
                            Text(Testo.quanti(x.fatture, "fattura", "fatture") + " · incassato " + euro(x.incassato), style = Testi.secondario, color = c.tenue)
                        }
                        Text(euro(x.compenso), style = Testi.secondarioGrande.copy(fontWeight = FontWeight.ExtraBold), color = c.testo)
                    }
                }
            }
            PulsanteBordo("Esporta il riepilogo", { esporta("riepilogo", listOf("anno" to anno.toString(), "per" to per), "Riepilogo del fatturato $anno") }, Modifier.fillMaxWidth(), icona = Icone.scarica)
        }
    }
}

// ---------------------------------------------------------------------------------- scadenze di pagamento

/** Le scadenze di pagamento delle commesse (§13.3), un livello sotto: dal menu ⋯. */
@Composable
fun SchermataScadenzeCommesse(dati: Dati, nav: Navigatore) {
    val c = W.colori
    var giro by remember { mutableIntStateOf(0) }
    val lettura = rememberLettura(Unit, giro) { dati.fase4.scadenzePagamento() }
    Column(
        Modifier.fillMaxSize().background(c.fondo).verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = 40.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Testata(onIndietro = { nav.indietro() })
        TitoloPagina("Scadenze di pagamento")
        when (lettura) {
            is Lettura.InCorso -> Segnaposto(240.dp)
            is Lettura.Errore -> SchedaErrore(lettura.messaggio) { giro++ }
            is Lettura.Pronta -> {
                if (lettura.dato.isEmpty()) Scheda(orizzontale = 18.dp, verticale = 16.dp) { RigaCalma("Nessuna scadenza di pagamento") }
                lettura.dato.groupBy { it.idCommessa }.forEach { (id, sc) ->
                    ScadenzeDellaCommessa(id, sc) { nav.vai("commessa/$id") }
                }
            }
        }
    }
}

/** Le scadenze di una commessa con lo stato a parola e "1.140,00 fatturati su 3.800,00". */
@Composable
internal fun ScadenzeDellaCommessa(idCommessa: String, sc: List<ScadenzaCommessa>, onApri: (() -> Unit)?) {
    val c = W.colori
    Scheda(orizzontale = 16.dp, verticale = 14.dp, spazio = 6.dp) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            CodiceCommessa(idCommessa)
            Text(sc.firstOrNull()?.commessa.orEmpty(), style = Testi.forte, color = c.testo, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
            if (onApri != null) PulsanteTesto("Apri", onApri)
        }
        val fatturato = sc.filter { it.stato == "fatturata" || it.stato == "incassata" }.sumOf { it.importo ?: 0.0 }
        Text(euro(fatturato).removeSuffix(" €") + " fatturati su " + euro(sc.sumOf { it.importo ?: 0.0 }).removeSuffix(" €"), style = Testi.secondario, color = c.tenue)
        sc.forEach { s ->
            LineaElenco()
            Row(Modifier.fillMaxWidth().heightIn(min = 52.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Column(Modifier.weight(1f)) {
                    Text(s.descrizione, style = Testi.forte.copy(fontWeight = FontWeight.Bold), color = c.testo)
                    Text(ScadenzaCommessa.quandoParole(s.quando, s.data), style = Testi.secondario, color = c.tenue)
                }
                Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(euro(s.importo), style = Testi.secondarioGrande.copy(fontWeight = FontWeight.ExtraBold), color = c.testo)
                    val parola = s.statoVisto
                    when (s.stato) {
                        "incassata" -> Pillolina(parola, c.firmatoTesto, c.firmatoFondo)
                        "fatturata", "in_bozza" -> Pillolina(parola, c.inviatoTesto, c.inviatoFondo)
                        else -> Pillolina(parola, c.fatturatoTesto, c.fatturatoFondo)
                    }
                }
            }
        }
    }
}

/** Per [giornoParole] negli altri file. */
internal fun giornoDi(iso: String): String = giornoParole(iso)

/**
 * La fatturazione della commessa (§13.1, §15.12): come si fattura, contratto,
 * fatturato, incassato, da fatturare, in bozza, previsto; le scadenze di pagamento
 * col loro stato; le fatture. Solo per chi vede le fatture.
 */
@Composable
internal fun FatturazioneDellaCommessa(dati: Dati, idCommessa: String, nav: Navigatore) {
    val c = W.colori
    var giro by remember { mutableIntStateOf(0) }
    val lettura = rememberLettura(idCommessa, giro + RicordoFatture.giro * 1000) { dati.fase4.fatturazioneCommessa(idCommessa) }
    when (lettura) {
        is Lettura.InCorso -> Segnaposto(120.dp)
        is Lettura.Errore -> SchedaErrore(lettura.messaggio) { giro++ }
        is Lettura.Pronta -> {
            val f = lettura.dato
            Text("Come si fattura: " + eu.stgm.wisper.rapportino.FatturazioneCommessa.modoParole(f.modoFatturazione), style = Testi.secondarioGrande, color = c.tenue)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                RiquadroEuro("Contratto", f.contratto, Modifier.weight(1f))
                RiquadroEuro("Fatturato", f.fatturato, Modifier.weight(1f))
                RiquadroEuro("Incassato", f.incassato, Modifier.weight(1f))
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                RiquadroEuro("Da fatturare", f.daFatturare, Modifier.weight(1f))
                RiquadroEuro("In bozza", f.inBozza, Modifier.weight(1f))
                RiquadroEuro("Previsto", f.previsto, Modifier.weight(1f))
            }
            if (f.scadenze.isNotEmpty()) ScadenzeDellaCommessa(idCommessa, f.scadenze, null)
            if (f.fatture.isNotEmpty()) {
                TitoloSezione("Fatture")
                SchedaElenco {
                    f.fatture.forEachIndexed { i, x ->
                        if (i > 0) LineaElenco()
                        RigaFatturaElenco(x) { nav.vai("fattura/${x.id}") }
                    }
                }
            }
        }
    }
}
