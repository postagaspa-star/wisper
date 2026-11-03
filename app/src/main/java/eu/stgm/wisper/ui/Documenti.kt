@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package eu.stgm.wisper.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import eu.stgm.wisper.Dati
import eu.stgm.wisper.rapportino.CategoriaDoc
import eu.stgm.wisper.rapportino.ColoreFase5
import eu.stgm.wisper.rapportino.DocArchivio
import eu.stgm.wisper.rapportino.FiltroArchivio
import eu.stgm.wisper.rapportino.Moduli
import eu.stgm.wisper.rapportino.Numeri
import eu.stgm.wisper.rapportino.PonteServer
import eu.stgm.wisper.rapportino.Ruoli
import eu.stgm.wisper.rapportino.Scadenza
import eu.stgm.wisper.rapportino.Spazio
import eu.stgm.wisper.rapportino.dataIt
import eu.stgm.wisper.rapportino.giornoParole
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.time.LocalDate

/*
 * 11 Documenti sul telefono (fase5.md §12.3): Archivio · Da approvare · Scadenze ·
 * Modelli. Il giallo cambia col segmento: Aggiungi un documento, Nuova scadenza,
 * Nuova lettera (chi ha i documenti in scrittura); il collaboratore legge.
 */

enum class SegmentoDocumenti(val nome: String) { ARCHIVIO("Archivio"), APPROVARE("Da approvare"), SCADENZE("Scadenze"), MODELLI("Modelli") }

/** Un documento da aggiungere già pronto: dal Condividi di Android, da una scheda, da una scadenza. */
data class DocumentoPreparato(
    val url: String = "",
    val file: FileArrivato? = null,
    val idCliente: String = "",
    val idCommessa: String = "",
    val idSede: String = "",
    val idTicket: String = "",
    val categoria: String = "",
    val chiudeScadenza: String = "",
)

object RicordoDocumenti {
    var segmento by mutableStateOf(SegmentoDocumenti.ARCHIVIO)
    var filtro by mutableStateOf(FiltroArchivio())
    var etichettaFiltro by mutableStateOf("")
    var preparato: DocumentoPreparato? = null

    /** Dalla Dashboard: {segmento: archivio | approvare | scadenze | modelli, daClassificare}. */
    fun mostra(segmento: String, daClassificare: Boolean = false) {
        this.segmento = when (segmento) { "approvare" -> SegmentoDocumenti.APPROVARE; "scadenze" -> SegmentoDocumenti.SCADENZE; "modelli" -> SegmentoDocumenti.MODELLI; else -> SegmentoDocumenti.ARCHIVIO }
        filtro = FiltroArchivio(daClassificare = daClassificare)
        etichettaFiltro = if (daClassificare) "Da classificare" else ""
    }
}

@Composable
fun SchermataDocumenti(dati: Dati, nav: Navigatore) {
    val c = W.colori
    val sessione by dati.sessione.collectAsStateWithLifecycle()
    val dashboard by dati.dashboard.collectAsStateWithLifecycle()
    val scrive = scriveDocumenti()
    val miePending = (dashboard?.fase5?.documentiDaApprovare ?: 0) > 0
    val segmenti = SegmentoDocumenti.entries.filter { it != SegmentoDocumenti.APPROVARE || sessione.puoApprovareDocumenti || miePending || scrive }
    val seg = RicordoDocumenti.segmento.takeIf { it in segmenti } ?: SegmentoDocumenti.ARCHIVIO
    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).padding(top = 10.dp, bottom = 130.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            TestataInterna({ nav.indietro() })
            TitoloPagina("Documenti")
            SegmentiScorrevoli(segmenti.map { it to it.nome }, seg, { RicordoDocumenti.segmento = it })
            when (seg) {
                SegmentoDocumenti.ARCHIVIO -> PaginaArchivio(dati, nav)
                SegmentoDocumenti.APPROVARE -> PaginaDaApprovare(dati, nav)
                SegmentoDocumenti.SCADENZE -> PaginaScadenze(dati, nav)
                SegmentoDocumenti.MODELLI -> PaginaModelli(dati, nav)
            }
        }
        if (scrive) when (seg) {
            SegmentoDocumenti.ARCHIVIO -> FondoConPulsante(Modifier.align(Alignment.BottomCenter)) {
                PulsantePrincipale("Aggiungi un documento", { RicordoDocumenti.preparato = null; nav.vai("documento-nuovo") }, icona = Icone.piu)
            }
            SegmentoDocumenti.SCADENZE -> FondoConPulsante(Modifier.align(Alignment.BottomCenter)) {
                PulsantePrincipale("Nuova scadenza", { nav.vai("scadenza-nuova") }, icona = Icone.piu)
            }
            SegmentoDocumenti.MODELLI -> FondoConPulsante(Modifier.align(Alignment.BottomCenter)) {
                PulsantePrincipale("Nuova lettera", { nav.vai("lettera-nuova") }, icona = Icone.piu)
            }
            else -> {}
        }
    }
}

// ---------------------------------------------------------------------------------- archivio

private enum class FiltroDocs(val nome: String) { TUTTI("Tutti"), CLIENTE("Per cliente"), COMMESSA("Per commessa"), IMPIANTO("Per impianto"), CLASSIFICARE("Da classificare") }

@Composable
private fun PaginaArchivio(dati: Dati, nav: Navigatore) {
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    var cerca by rememberSaveable { mutableStateOf(RicordoDocumenti.filtro.testo) }
    var scegli by remember { mutableStateOf<FiltroDocs?>(null) }
    var giro by remember { mutableIntStateOf(0) }
    val filtro = RicordoDocumenti.filtro.copy(testo = cerca)
    val lettura = rememberLettura(filtro, giro + Giri5.documenti * 1000) { dati.fase5.documenti(filtro) }
    val categorie = rememberLettura("categorie", 0) { dati.fase5.categorie() }

    CampoCerca(cerca, { cerca = it }, "Cerca titolo, cliente, commessa, impianto")
    if (RicordoDocumenti.etichettaFiltro.isNotBlank()) {
        ChipFiltro(RicordoDocumenti.etichettaFiltro, { RicordoDocumenti.filtro = FiltroArchivio(); RicordoDocumenti.etichettaFiltro = "" })
    } else {
        SchedePillole(FiltroDocs.entries.map { it to it.nome }, FiltroDocs.TUTTI, { f ->
            when (f) {
                FiltroDocs.TUTTI -> {}
                FiltroDocs.CLASSIFICARE -> { RicordoDocumenti.filtro = FiltroArchivio(daClassificare = true); RicordoDocumenti.etichettaFiltro = "Da classificare" }
                else -> scegli = f
            }
        })
    }
    (categorie as? Lettura.Pronta)?.dato?.filter { it.documenti > 0 }?.takeIf { it.isNotEmpty() }?.let { cat ->
        SchedePillole(listOf("" to "Tutte le categorie") + cat.map { it.id to it.nome }, RicordoDocumenti.filtro.idCategoria, { id ->
            RicordoDocumenti.filtro = RicordoDocumenti.filtro.copy(idCategoria = id, pagina = 1)
        })
    }
    when (lettura) {
        is Lettura.InCorso -> { Segnaposto(80.dp); Segnaposto(80.dp) }
        is Lettura.Errore -> SchedaErrore(lettura.messaggio) { giro++ }
        is Lettura.Pronta -> {
            val e = lettura.dato
            SchedaElenco {
                if (e.documenti.isEmpty()) RigaCalma("Nessun documento.")
                e.documenti.forEachIndexed { i, d -> if (i > 0) LineaElenco(); RigaDocumento(d) { nav.vai("documento/${d.id}") } }
            }
            if (e.pagine > 1) Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                if (e.pagina > 1) PulsanteBordo("Prima", { RicordoDocumenti.filtro = RicordoDocumenti.filtro.copy(pagina = e.pagina - 1) }, Modifier.weight(1f), altezza = 48.dp)
                if (e.pagina < e.pagine) PulsanteBordo("Altri documenti", { RicordoDocumenti.filtro = RicordoDocumenti.filtro.copy(pagina = e.pagina + 1) }, Modifier.weight(1f), altezza = 48.dp)
            }
            if (e.daWisper.isNotEmpty()) Sezione5("Da Wisper", e.daWisper.size) { SchedaDaWisper(e.daWisper, nav, dati) }
        }
    }
    RigaSfoglia()
    when (scegli) {
        FiltroDocs.CLIENTE -> FoglioSceltaCliente(ana, "", { cl -> scegli = null; if (cl != null) { RicordoDocumenti.filtro = FiltroArchivio(idCliente = cl.id); RicordoDocumenti.etichettaFiltro = cl.nome } }, { scegli = null })
        FiltroDocs.COMMESSA -> FoglioSceltaCommessa(ana, "", { id -> scegli = null; RicordoDocumenti.filtro = FiltroArchivio(idCommessa = id); RicordoDocumenti.etichettaFiltro = id }, { scegli = null })
        FiltroDocs.IMPIANTO -> FoglioDalBasso({ scegli = null }) {
            Text("Impianto", style = Testi.titoloScheda, color = W.colori.testo)
            Column(Modifier.heightIn(max = 420.dp).verticalScroll(rememberScrollState())) {
                ana.sedi.filter { it.impianto && !it.archiviata }.forEachIndexed { i, s ->
                    if (i > 0) LineaElenco()
                    RigaVoce(s.nome, sotto = ana.cliente(s.idSoggetto)?.nome, icona = Icone.fulmine, freccia = false, onClick = {
                        scegli = null; RicordoDocumenti.filtro = FiltroArchivio(idSede = s.id); RicordoDocumenti.etichettaFiltro = s.nome
                    })
                }
            }
        }
        else -> {}
    }
}

/** Le righe "Da Wisper" (§5.6): preventivi, rapportini firmati, fatture, contratti, che aprono la loro pagina. */
@Composable
internal fun SchedaDaWisper(voci: List<eu.stgm.wisper.rapportino.VoceDaWisper>, nav: Navigatore, dati: Dati) {
    val viste by dati.viste.collectAsStateWithLifecycle()
    SchedaElenco {
        voci.forEachIndexed { i, v ->
            if (i > 0) LineaElenco()
            RigaVoce(v.titolo, sotto = v.dettaglio.ifBlank { null }, icona = when (v.tipo) { "rapportino" -> Icone.firma; "fattura" -> Icone.fatturazione; else -> Icone.preventivo }, onClick = {
                when (v.pagina) {
                    "rapportino" -> viste.firstOrNull { it.rapportino.id == v.id }?.let { nav.apriRapportino(it.rapportino.idLocale) } ?: nav.sezione(Sezione.RAPPORTINI, FiltroRapportini(mese = null, testo = v.id))
                    "preventivo" -> nav.vai("preventivo/${v.id}")
                    "fattura" -> nav.vai("fattura/${v.id}")
                    "contratto" -> nav.vai("contratto-ca/${v.id}")
                }
            })
        }
    }
}

// ---------------------------------------------------------------------------------- da approvare

@Composable
private fun PaginaDaApprovare(dati: Dati, nav: Navigatore) {
    var giro by remember { mutableIntStateOf(0) }
    val attesa = rememberLettura("da_approvare", giro + Giri5.documenti * 1000) { dati.fase5.documenti(FiltroArchivio(stato = "da_approvare")) }
    val respinti = rememberLettura("respinti", giro + Giri5.documenti * 1000) { dati.fase5.documenti(FiltroArchivio(stato = "respinti")) }
    when (attesa) {
        is Lettura.InCorso -> Segnaposto(80.dp)
        is Lettura.Errore -> SchedaErrore(attesa.messaggio) { giro++ }
        is Lettura.Pronta -> SchedaElenco {
            if (attesa.dato.documenti.isEmpty()) RigaCalma("Niente da approvare.")
            attesa.dato.documenti.forEachIndexed { i, d ->
                if (i > 0) LineaElenco()
                RigaVoce(d.titolo, sotto = listOfNotNull(d.daApprovare?.let { "rev. $it da approvare" }, d.categoria, d.legatoA).joinToString(" · "),
                    icona = Icone.documento, fine = { Parola5("Da approvare") }, onClick = { nav.vai("documento/${d.id}") })
            }
        }
    }
    (respinti as? Lettura.Pronta)?.dato?.documenti?.takeIf { it.isNotEmpty() }?.let { l ->
        Sezione5("Le tue respinte", l.size) {
            SchedaElenco { l.forEachIndexed { i, d -> if (i > 0) LineaElenco(); RigaVoce(d.titolo, sotto = d.categoria, icona = Icone.documento, fine = { Parola5("Respinta") }, onClick = { nav.vai("documento/${d.id}") }) } }
        }
    }
}

// ---------------------------------------------------------------------------------- scadenze

@Composable
private fun PaginaScadenze(dati: Dati, nav: Navigatore) {
    val ops by dati.operazioni.collectAsStateWithLifecycle()
    var giro by remember { mutableIntStateOf(0) }
    var aperta by remember { mutableStateOf<Scadenza?>(null) }
    val fatteQui = ops.filter { it.tipo == eu.stgm.wisper.rapportino.CodaInvii.Tipo.FAI_SCADENZA }.map { it.idLocale.removePrefix("scadenza:") }.toSet()
    val lettura = rememberLettura("scadenze", giro + Giri5.documenti * 1000 + fatteQui.size * 7) { dati.fase5.scadenze() }
    when (lettura) {
        is Lettura.InCorso -> { Segnaposto(80.dp); Segnaposto(80.dp) }
        is Lettura.Errore -> SchedaErrore(lettura.messaggio) { giro++ }
        is Lettura.Pronta -> {
            val e = lettura.dato
            fun conCoda(l: List<Scadenza>) = l.map { if (it.id in fatteQui) it.copy(inCoda = true) else it }
            listOf("Scadute" to conCoda(e.scadute), "Nel preavviso" to conCoda(e.entro), "Più avanti" to conCoda(e.piuAvanti)).forEach { (nome, l) ->
                Sezione5(nome, l.size) {
                    SchedaElenco {
                        if (l.isEmpty()) RigaCalma("Niente qui.")
                        l.forEachIndexed { i, s -> if (i > 0) LineaElenco(); RigaScadenza(s) { aperta = s } }
                    }
                }
            }
        }
    }
    aperta?.let { s -> FoglioDalBasso({ aperta = null }) { ContenutoScadenza(dati, nav, s, onFatto = { aperta = null; giro++ }) } }
}

/** La scadenza aperta (§12.3): i dati, Segna fatta (giallo), il verbale, la lettera, Rimanda, Togli. */
@Composable
internal fun ContenutoScadenza(dati: Dati, nav: Navigatore, s: Scadenza, onFatto: () -> Unit) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    var rimanda by remember { mutableStateOf(false) }
    var togli by remember { mutableStateOf(false) }
    Text(s.titolo, style = Testi.titoloScheda, color = c.testo)
    Parola5(if (s.inCoda) "Fatta" else s.statoVisto)
    Scheda(orizzontale = 16.dp, verticale = 12.dp, spazio = 6.dp) {
        RigaDato("Data", giornoParole(s.data) + " " + s.data.take(4))
        RigaDato("Ogni", s.ogniParole.replaceFirstChar { it.uppercase() } + if (s.ogniMesi != null) (if (s.dallaFatta) ", da quando si fa" else ", dalla data prevista") else "")
        RigaDato("Cliente", s.cliente.ifBlank { "Studio" })
        if (s.impianto.isNotBlank()) RigaDato("Impianto", s.impianto)
        if (s.documento.isNotBlank()) RigaDato("Documento", s.documento)
        if (s.ticket.isNotBlank()) RigaDato("Ticket", s.ticket)
        else if (s.azione == "ticket" && s.anticipoGiorni != null) RigaDato("Ticket", "nasce il " + dataIt(LocalDate.parse(s.data.take(10)).minusDays(s.anticipoGiorni.toLong()).toString()))
        s.preavvisoGiorni?.let { RigaDato("Preavviso", "$it giorni") }
    }
    if (s.ticket.isNotBlank() && s.idTicket.isNotBlank()) PulsanteBordo("Apri il ticket ${s.ticket}", { onFatto(); nav.vai("ticket/${s.idTicket}") }, Modifier.fillMaxWidth(), icona = Icone.chiave)
    if (s.idDocumento.isNotBlank()) PulsanteBordo("Apri il documento", { onFatto(); nav.vai("documento/${s.idDocumento}") }, Modifier.fillMaxWidth(), icona = Icone.documento)
    if (s.stato == "aperta" && s.puoScrivere && !s.inCoda) {
        if (LocalPermessi.current.modifica(Moduli.DOCUMENTI) && s.tipo.startsWith("verifica")) {
            PulsanteBordo("Carica il verbale e segna fatta", {
                RicordoDocumenti.preparato = DocumentoPreparato(idCliente = s.idCliente, idSede = s.idSede, categoria = "Verbali di verifica", chiudeScadenza = s.id)
                onFatto(); nav.vai("documento-nuovo")
            }, Modifier.fillMaxWidth(), icona = Icone.importa)
            PulsanteBordo("Prepara la lettera per il cliente", { onFatto(); nav.vai("lettera-nuova/${s.id}") }, Modifier.fillMaxWidth(), icona = Icone.documento)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            PulsanteTesto("Rimanda", { rimanda = true })
            PulsanteTesto("Togli", { togli = true }, colore = c.rossoTesto)
        }
        if (s.azione != "ticket") PulsantePrincipale("Segna fatta", {
            if (dati.esempio) { avvisi.mostra(SOLO_ESEMPIO); return@PulsantePrincipale }
            dati.fase5.faiScadenza(s.id)
            avvisi.mostra(if (s.ogniMesi != null) "Fatta: nasce la prossima" else "Fatta")
            onFatto()
        }, icona = Icone.spunta)
    }
    if (rimanda) FinestraGiorno(LocalDate.parse(s.data.take(10)), { g ->
        scope.launch {
            dati.fase5.salvaScadenza(JSONObject().put("id", PonteServer.idJson(s.id)).put("tipo", s.tipo).put("titolo", s.titolo).put("data", g.toString()))
                .onSuccess { avvisi.mostra("Spostata al " + dataIt(g.toString())); onFatto() }.onFailure { avvisi.mostra(spiegaErrore2(it, "Non è stata spostata: riprova")) }
        }
    }, { rimanda = false })
    if (togli) {
        var anche by remember { mutableStateOf(false) }
        FoglioMotivo("Togli la scadenza", "Non serve più", "Togli", pericolo = true, onChiudi = { togli = false }) { m ->
            togli = false
            scope.launch {
                dati.fase5.togliScadenza(s.id, m, anche).onSuccess { avvisi.mostra("Tolta"); onFatto() }.onFailure { avvisi.mostra(spiegaErrore2(it, "Non è stata tolta: riprova")) }
            }
        }
    }
}

/** La scadenza aperta come pagina (dalla Dashboard o dal calendario). */
@Composable
fun SchermataScadenza(dati: Dati, nav: Navigatore, id: String) {
    val c = W.colori
    var giro by remember { mutableIntStateOf(0) }
    val lettura = rememberLettura(id, giro) {
        dati.fase5.scadenzeDi(listOf("stato" to "tutte")).map { e -> e.tutte.firstOrNull { it.id == id } ?: throw PonteServer.Rifiutato("Scadenza $id non trovata") }
    }
    Column(Modifier.fillMaxSize().background(c.fondo).verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = 40.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        TestataInterna({ nav.indietro() })
        when (lettura) {
            is Lettura.InCorso -> Segnaposto(200.dp)
            is Lettura.Errore -> SchedaErrore(lettura.messaggio) { giro++ }
            is Lettura.Pronta -> ContenutoScadenza(dati, nav, lettura.dato, onFatto = { giro++ })
        }
    }
}

/** Nuova scadenza (§12.3): cosa, di che tipo, per chi e quale impianto, quando, ogni quanto, il preavviso. */
@Composable
fun SchermataNuovaScadenza(dati: Dati, nav: Navigatore) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    var tipo by rememberSaveable { mutableStateOf("verifica_terra") }
    var titolo by rememberSaveable { mutableStateOf("") }
    var idCliente by rememberSaveable { mutableStateOf("") }
    var idSede by rememberSaveable { mutableStateOf("") }
    var data by rememberSaveable { mutableStateOf(LocalDate.now().plusMonths(1).toString()) }
    var ogni by rememberSaveable { mutableStateOf(-1) }
    var preavviso by rememberSaveable { mutableStateOf(-1) }
    var note by rememberSaveable { mutableStateOf("") }
    var cliente by remember { mutableStateOf(false) }
    var giorno by remember { mutableStateOf(false) }
    var errore by remember { mutableStateOf<String?>(null) }
    var invio by remember { mutableStateOf(false) }
    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = 130.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Testata(onIndietro = { nav.indietro() }, chiudi = true)
            TitoloPagina("Nuova scadenza")
            Domanda("Che cos'è") { SceltePillole(Scadenza.TIPI.toList().filter { it.first != "contratto" && it.first != "manutenzione" }, tipo, { tipo = it }) }
            CampoTesto(titolo, { titolo = it }, "Titolo", segnaposto = Scadenza.TIPI[tipo].orEmpty())
            Domanda("Per chi") {
                CampoDaScegliere("Cliente", ana.cliente(idCliente)?.nome ?: "Studio", false, { cliente = true })
                if (idCliente.isNotBlank()) SceltePillole(ana.sediDi(idCliente).filter { it.impianto }.map { it.id to it.nome } + ("" to "Nessun impianto"), idSede, { idSede = it })
            }
            CampoDaScegliere("Quando", giornoParole(data) + " " + data.take(4), false, { giorno = true })
            Domanda("Ogni") { SceltePillole(listOf(-1 to "Proposta di Wisper", 0 to "Una volta", 12 to "Ogni anno", 24 to "2 anni", 60 to "5 anni"), ogni, { ogni = it }) }
            Domanda("Preavviso") { SceltePillole(listOf(-1 to "Proposto", 30 to "30 giorni", 60 to "60 giorni", 90 to "90 giorni"), preavviso, { preavviso = it }) }
            CampoTesto(note, { note = it }, "Note", righe = 2)
            errore?.let { Text(it, style = Testi.forte.copy(fontWeight = FontWeight.Bold), color = c.rossoTesto) }
        }
        FondoConPulsante(Modifier.align(Alignment.BottomCenter)) {
            PulsantePrincipale(if (invio) "Salvo…" else "Salva la scadenza", {
                if (invio) return@PulsantePrincipale
                if (dati.esempio) { avvisi.mostra(SOLO_ESEMPIO); return@PulsantePrincipale }
                val o = JSONObject().put("tipo", tipo).put("data", data)
                if (titolo.isNotBlank()) o.put("titolo", titolo.trim())
                if (idCliente.isNotBlank()) o.put("idCliente", idCliente)
                if (idSede.isNotBlank()) o.put("idSede", PonteServer.idJson(idSede))
                if (ogni >= 0) o.put("ogniMesi", ogni)
                if (preavviso >= 0) o.put("preavvisoGiorni", preavviso)
                if (note.isNotBlank()) o.put("note", note.trim())
                invio = true
                scope.launch {
                    dati.fase5.salvaScadenza(o).onSuccess { avvisi.mostra("Scadenza salvata: ${it.statoVisto.lowercase()}"); Giri5.documenti++; nav.indietro() }
                        .onFailure { errore = spiegaErrore2(it, "La scadenza non si è salvata: riprova") }
                    invio = false
                }
            }, icona = Icone.spunta, abilitato = !invio)
        }
    }
    if (cliente) FoglioSceltaCliente(ana, idCliente, { cl -> idCliente = cl?.id.orEmpty(); idSede = ""; cliente = false }, { cliente = false }, conNessuno = true)
    if (giorno) FinestraGiorno(LocalDate.parse(data), { data = it.toString() }, { giorno = false })
}

// ---------------------------------------------------------------------------------- modelli

@Composable
private fun PaginaModelli(dati: Dati, nav: Navigatore) {
    val avvisi = LocalAvvisi.current
    val amm = LocalPermessi.current.modifica(Moduli.AMMINISTRAZIONE)
    var giro by remember { mutableIntStateOf(0) }
    val lettura = rememberLettura("modelli", giro) { dati.fase5.modelli() }
    when (lettura) {
        is Lettura.InCorso -> Segnaposto(160.dp)
        is Lettura.Errore -> SchedaErrore(lettura.messaggio) { giro++ }
        is Lettura.Pronta -> {
            val m = lettura.dato
            Sezione5("Modelli di Wisper") {
                SchedaElenco {
                    m.wisper.forEachIndexed { i, x ->
                        if (i > 0) LineaElenco()
                        RigaVoce(x.nome, sotto = "impaginazione fissa" + if (x.testi.isNotEmpty()) " · " + Testo.quanti(x.testi.size, "testo", "testi") else "", icona = Icone.documento,
                            onClick = { if (amm) nav.vai("modello-testi/${x.chiave}") else avvisi.mostra("I testi li cambia chi ha Amministrazione") })
                    }
                }
            }
            Sezione5("Modelli dello studio", m.studio.size) {
                SchedaElenco {
                    if (m.studio.isEmpty()) RigaCalma("Nessun modello dello studio.")
                    m.studio.forEachIndexed { i, d -> if (i > 0) LineaElenco(); RigaDocumento(d) { nav.vai("documento/${d.id}") } }
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------------- amministrazione: categorie e spazio

@Composable
internal fun PaginaCategorie(dati: Dati, puo: Boolean, onIndietro: () -> Unit) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    var giro by remember { mutableIntStateOf(0) }
    var aperta by remember { mutableStateOf<CategoriaDoc?>(null) }
    val lettura = rememberLettura("categorie-amm", giro) { dati.fase5.categorie() }
    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = 40.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Testata(onIndietro = onIndietro)
            TitoloPagina("Categorie dei documenti")
            when (lettura) {
                is Lettura.InCorso -> Segnaposto(200.dp)
                is Lettura.Errore -> SchedaErrore(lettura.messaggio) { giro++ }
                is Lettura.Pronta -> SchedaElenco {
                    lettura.dato.forEachIndexed { i, k ->
                        if (i > 0) LineaElenco()
                        val sotto = listOfNotNull(
                            if (k.approvazione) "Da approvare" else "Senza approvazione",
                            when (k.vede) { "costi" -> "chi vede i prezzi"; "riservati" -> "riservata"; else -> "tutti" },
                            k.scadenzaMesi?.let { "scade dopo $it mesi" }, if (!k.attiva) "non si usa più" else null, Testo.quanti(k.documenti, "documento", "documenti"),
                        ).joinToString(" · ")
                        RigaVoce(k.nome, sotto = sotto, icona = Icone.documento, freccia = puo, onClick = if (puo) ({ aperta = k }) else null)
                    }
                }
            }
            if (puo) PulsanteBordo("Nuova categoria", { aperta = CategoriaDoc("", "", false, "tutti", null, 0, true, false, 0) }, Modifier.fillMaxWidth(), icona = Icone.piu)
        }
    }
    aperta?.let { k ->
        var nome by remember(k) { mutableStateOf(k.nome) }
        var approvazione by remember(k) { mutableStateOf(k.approvazione) }
        var vede by remember(k) { mutableStateOf(k.vede) }
        var mesi by remember(k) { mutableStateOf(k.scadenzaMesi?.toString().orEmpty()) }
        var attiva by remember(k) { mutableStateOf(k.attiva) }
        var errore by remember(k) { mutableStateOf<String?>(null) }
        FoglioDalBasso({ aperta = null }) {
            Text(if (k.id.isBlank()) "Nuova categoria" else k.nome, style = Testi.titoloScheda, color = c.testo)
            CampoTesto(nome, { nome = it }, "Nome", errore = errore)
            RigaSiNo("Le revisioni vanno approvate", approvazione) { approvazione = it }
            Domanda("Chi la vede") { SceltePillole(listOf("tutti" to "Tutti", "costi" to "Chi vede i prezzi", "riservati" to "Riservata"), vede, { vede = it }) }
            CampoTesto(mesi, { mesi = it }, "Scadenza proposta", tastiera = KeyboardType.Number, suffisso = "mesi")
            if (!k.sistema) RigaSiNo("Si usa", attiva) { attiva = it }
            PulsanteBordo("Salva", {
                val o = JSONObject().put("nome", nome.trim()).put("approvazione", approvazione).put("vede", vede).put("attiva", attiva)
                    .put("scadenzaMesi", mesi.toIntOrNull() ?: JSONObject.NULL)
                if (k.id.isNotBlank()) o.put("id", PonteServer.idJson(k.id))
                scope.launch {
                    dati.fase5.salvaCategoria(o).onSuccess { aperta = null; giro++; avvisi.mostra("Salvata: vale per i documenti nuovi") }
                        .onFailure { errore = spiegaErrore2(it, "Non si è salvata: riprova") }
                }
            }, Modifier.fillMaxWidth())
        }
    }
}

@Composable
internal fun PaginaSpazio(dati: Dati, puo: Boolean, onIndietro: () -> Unit) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    val sessione by dati.sessione.collectAsStateWithLifecycle()
    var giro by remember { mutableIntStateOf(0) }
    var conferma by remember { mutableStateOf<String?>(null) }
    val lettura = rememberLettura("spazio", giro) { dati.fase5.spazio() }
    Column(Modifier.fillMaxSize().background(c.fondo).verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = 40.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Testata(onIndietro = onIndietro)
        TitoloPagina("Spazio sul NAS")
        when (lettura) {
            is Lettura.InCorso -> Segnaposto(200.dp)
            is Lettura.Errore -> SchedaErrore(lettura.messaggio) { giro++ }
            is Lettura.Pronta -> {
                val s: Spazio = lettura.dato
                val cestino = s.perTipo.firstOrNull { it.tipo == "cestino" }?.mb ?: 0.0
                RiquadriDue(listOf(
                    Triple(Spazio.parole(s.liberoMb), "liberi", null),
                    Triple(Spazio.parole(s.fileMb), "usati da Wisper", null),
                    Triple(Spazio.parole(cestino), "nel cestino", null),
                    Triple("${s.troppoGrandi.size}", "file solo sul NAS", null),
                ), rossi = if (s.troppoGrandi.isNotEmpty()) setOf(3) else emptySet())
                val massimo = (s.perTipo.maxOfOrNull { it.mb } ?: 0.0).coerceAtLeast(0.1)
                Scheda(orizzontale = 18.dp, verticale = 14.dp, spazio = 10.dp) {
                    Etichetta("Dove va lo spazio")
                    s.perTipo.forEach { x ->
                        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Row { Text(x.nome, style = Testi.forte.copy(fontWeight = FontWeight.Bold), color = c.testo, modifier = Modifier.weight(1f)); Text(Spazio.parole(x.mb) + " · " + Testo.quanti(x.quanti, "file", "file"), style = Testi.secondario, color = c.tenue) }
                            Box(Modifier.fillMaxWidth().height(10.dp).clip(RoundedCornerShape(5.dp)).background(c.superficie2)) {
                                Box(Modifier.fillMaxWidth((x.mb / massimo).toFloat().coerceIn(0.03f, 1f)).fillMaxHeight().clip(RoundedCornerShape(5.dp)).background(c.testo))
                            }
                        }
                    }
                }
                if (s.troppoGrandi.isNotEmpty()) Sezione5("Solo sul NAS", s.troppoGrandi.size) {
                    SchedaElenco { s.troppoGrandi.forEachIndexed { i, f -> if (i > 0) LineaElenco(); RigaVoce(f.nome, sotto = Spazio.parole(f.mb) + " · troppo grande per la copia fuori casa", icona = Icone.disco, freccia = false, fine = { Parola5("Solo sul NAS", colore = ColoreFase5.AMBRA) }) } }
                }
                Scheda(orizzontale = 18.dp, verticale = 14.dp, spazio = 6.dp) {
                    RigaDato("Copia fuori casa", if (s.fuoriUltima.isBlank()) "ancora nessuna" else quandoCorto(s.fuoriUltima))
                    RigaDato("Da copiare", Testo.quanti(s.fuoriDaCopiare, "file", "file"))
                    RigaDato("Avviso sotto", Spazio.parole(s.avvisoMb))
                    RigaDato("Niente documenti nuovi sotto", Spazio.parole(s.minimoMb))
                }
                if (puo && sessione.utente.ruolo == Ruoli.TITOLARE) PulsanteBordo("Svuota il cestino", {
                    scope.launch {
                        dati.fase5.svuotaCestino(false).onSuccess { (n, _) -> avvisi.mostra(if (n == 0) "Niente da togliere: nel cestino non c'è niente da più di 90 giorni" else "Tolti $n file") }
                            .onFailure { e -> daConfermare(e)?.let { conferma = it.message } ?: avvisi.mostra(spiegaErrore2(e, "Non si è svuotato: riprova")) }
                    }
                }, Modifier.fillMaxWidth(), icona = Icone.cestino)
            }
        }
    }
    conferma?.let { testo ->
        FoglioConferma("Svuota il cestino", testo, "Togli per sempre", onConferma = {
            conferma = null
            scope.launch { dati.fase5.svuotaCestino(true).onSuccess { (n, mb) -> avvisi.mostra("Tolti $n file (${Spazio.parole(mb)})"); giro++ }.onFailure { avvisi.mostra(spiegaErrore2(it, "Non si è svuotato: riprova")) } }
        }, onAnnulla = { conferma = null }, pericolo = true)
    }
}

@Suppress("unused")
private fun numeroIt(n: Double) = Numeri.scrivi(n)

@Suppress("unused")
private val vuoto: List<DocArchivio> = emptyList()
