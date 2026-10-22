@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package eu.stgm.wisper.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
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
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import eu.stgm.wisper.Dati
import eu.stgm.wisper.rapportino.ContoBanca
import eu.stgm.wisper.rapportino.FiltroFatture
import eu.stgm.wisper.rapportino.Impegno
import eu.stgm.wisper.rapportino.Movimento
import eu.stgm.wisper.rapportino.PonteServer
import eu.stgm.wisper.rapportino.Ricevuta
import eu.stgm.wisper.rapportino.RigaScadenziario
import eu.stgm.wisper.rapportino.Scadenziario
import eu.stgm.wisper.rapportino.Situazione
import eu.stgm.wisper.rapportino.dataBreve
import eu.stgm.wisper.rapportino.dataDi
import eu.stgm.wisper.rapportino.dataIt
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate

/*
 * 09 Banche e scadenze sul telefono (fase4.md §13.4): Scadenziario · Movimenti ·
 * Tributi · Conti, e la Situazione un livello sotto (menu ⋯). Previsto, Registrato e
 * Verificato in banca sempre con la parola; estratti conto e banca Non collegato.
 * Tutto in diretta: un incasso senza rete non va in coda (il server non ha un idLocale
 * per gli incassi, e un incasso doppio sono soldi sbagliati).
 */

enum class SegmentoBanche { SCADENZIARIO, MOVIMENTI, TRIBUTI, CONTI }

object RicordoBanche {
    var segmento by mutableStateOf(SegmentoBanche.SCADENZIARIO)
    var giro by mutableIntStateOf(0)
    /** Dalla Dashboard: il giorno dello scadenziario da guardare (il primo sotto soglia). */
    var giorno: String = ""
    var soloProposte by mutableStateOf(false)
}

@Composable
fun SchermataBanche(dati: Dati, nav: Navigatore) {
    val c = W.colori
    val ctx = LocalContext.current
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    val scrive = scriveBanche()
    val seg = RicordoBanche.segmento
    var menu by remember { mutableStateOf(false) }
    var nuovoMovimento by remember { mutableStateOf(false) }
    var nuovoTributo by remember { mutableStateOf(false) }
    var saldo by remember { mutableStateOf(false) }
    var nuovoConto by remember { mutableStateOf(false) }
    val esporta: (String, String) -> Unit = { cosa, titolo ->
        avvisi.mostra("Preparo il file…")
        scope.launch { dati.fase4.esporta(cosa).onSuccess { condividiCsv(ctx, it, titolo) }.onFailure { avvisi.mostra(spiegaErrore2(it, "Il file non si è preparato: riprova")) } }
    }
    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).padding(top = 10.dp, bottom = 130.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            TestataMenu { PulsanteTondo(Icone.altro, "Altre azioni", { menu = true }) }
            TitoloPagina("Banche e scadenze")
            SegmentiScorrevoli(
                listOf(SegmentoBanche.SCADENZIARIO to "Scadenziario", SegmentoBanche.MOVIMENTI to "Movimenti", SegmentoBanche.TRIBUTI to "Tributi", SegmentoBanche.CONTI to "Conti"),
                seg, { RicordoBanche.segmento = it },
            )
            when (seg) {
                SegmentoBanche.SCADENZIARIO -> PaginaScadenziario(dati, nav, scrive)
                SegmentoBanche.MOVIMENTI -> PaginaMovimenti(dati, scrive)
                SegmentoBanche.TRIBUTI -> PaginaTributi(dati, scrive)
                SegmentoBanche.CONTI -> PaginaConti(dati, scrive)
            }
        }
        if (scrive) {
            val giallo: Pair<String, () -> Unit>? = when (seg) {
                SegmentoBanche.MOVIMENTI -> "Nuovo movimento" to { nuovoMovimento = true }
                SegmentoBanche.TRIBUTI -> "Nuovo tributo" to { nuovoTributo = true }
                SegmentoBanche.CONTI -> "Aggiorna il saldo" to { saldo = true }
                SegmentoBanche.SCADENZIARIO -> null
            }
            if (giallo != null) FondoConPulsante(Modifier.align(Alignment.BottomCenter)) {
                PulsantePrincipale(giallo.first, giallo.second, icona = if (seg == SegmentoBanche.CONTI) null else Icone.piu)
            }
        }
    }
    if (menu) FoglioDalBasso({ menu = false }) {
        Text("Altre azioni", style = Testi.titoloScheda, color = c.testo)
        VoceMenu(Icone.barre, "Situazione", { menu = false; nav.vai("banche-situazione") })
        if (scrive) VoceMenu(Icone.piu, "Nuovo conto", { menu = false; nuovoConto = true })
        VoceMenu(Icone.scarica, "Esporta lo scadenziario", { menu = false; esporta("scadenziario", "Lo scadenziario") })
        VoceMenu(Icone.scarica, "Esporta i movimenti", { menu = false; esporta("movimenti", "I movimenti") })
        VoceMenu(Icone.scarica, "Esporta i tributi e le rate", { menu = false; esporta("impegni", "Tributi e rate") })
    }
    if (nuovoMovimento) FoglioNuovoMovimento(dati, { nuovoMovimento = false }) { nuovoMovimento = false; RicordoBanche.giro++ }
    if (nuovoTributo) FoglioTributo(dati, null, { nuovoTributo = false }) { nuovoTributo = false; RicordoBanche.giro++ }
    if (saldo) FoglioAggiornaSaldo(dati, { saldo = false }) { saldo = false; RicordoBanche.giro++ }
    if (nuovoConto) FoglioConto(dati, null, { nuovoConto = false }) { nuovoConto = false; RicordoBanche.giro++ }
}

// ---------------------------------------------------------------------------------- scadenziario

@Composable
private fun PaginaScadenziario(dati: Dati, nav: Navigatore, scrive: Boolean) {
    val c = W.colori
    var giro by remember { mutableIntStateOf(0) }
    val lettura = rememberLettura(Unit, giro + RicordoBanche.giro * 1000) { dati.fase4.scadenziario(90) }
    val situazione = rememberLettura(Unit, giro + RicordoBanche.giro * 1000) { dati.fase4.situazione() }
    var segna by remember { mutableStateOf<RigaScadenziario?>(null) }
    var impegno by remember { mutableStateOf<String?>(null) }
    val s = (situazione as? Lettura.Pronta)?.dato
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.bersaglio("scadenziario")) {
        RiquadroEuro("Nei conti oggi", s?.saldoOggi, Modifier.weight(1f))
        RiquadroEuro("Da incassare", s?.daIncassare, Modifier.weight(1f), nota = s?.scadutoDaIncassare?.takeIf { it > 0 }?.let { "scaduto " + euro(it) })
        RiquadroEuro("Da pagare in 30 giorni", s?.daPagare30, Modifier.weight(1f))
    }
    if (s?.previsto30 != null) {
        val sotto = s.previsto30 < (s.soglia ?: 0.0)
        Text(
            "Saldo previsto fra 30 giorni: " + euro(s.previsto30) + if (sotto) " · Sotto soglia" else "",
            style = Testi.forte, color = if (sotto) c.rossoTesto else c.testo,
        )
    }
    when (lettura) {
        is Lettura.InCorso -> { Segnaposto(80.dp); Segnaposto(240.dp) }
        is Lettura.Errore -> SchedaErrore(lettura.messaggio) { giro++ }
        is Lettura.Pronta -> {
            val sc: Scadenziario = lettura.dato
            if (sc.nota.isNotBlank()) Text(sc.nota, style = Testi.secondario, color = c.tenue)
            if (sc.scaduti.isNotEmpty()) {
                TitoloSezione("Scaduti", Testo.quanti(sc.scaduti.size, "voce", "voci"))
                SchedaElenco {
                    sc.scaduti.forEachIndexed { i, r ->
                        if (i > 0) LineaElenco()
                        RigaScadenza(r) { segna = r }
                    }
                }
            }
            if (sc.giorni.isEmpty() && sc.scaduti.isEmpty()) Scheda(orizzontale = 18.dp, verticale = 16.dp) { RigaCalma("Niente in scadenza nei prossimi 90 giorni") }
            sc.giorni.forEach { g ->
                Row(Modifier.fillMaxWidth().padding(top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(g.titolo, style = Testi.forte, color = if (g.sottoSoglia) c.rossoTesto else c.testo, modifier = Modifier.weight(1f))
                    if (g.sottoSoglia) { Pillolina("Sotto soglia", c.rossoTesto, c.rossoTenue); SpazioLargo(8) }
                    Text(euro(g.saldo), style = Testi.forte, color = if (g.sottoSoglia) c.rossoTesto else c.testo)
                }
                Scheda(orizzontale = 14.dp, verticale = 0.dp, spazio = 0.dp, modifier = if (g.sottoSoglia) Modifier.background(c.rossoTenue, RoundedCornerShape(22.dp)) else Modifier) {
                    g.righe.forEachIndexed { i, r ->
                        if (i > 0) LineaElenco()
                        RigaScadenza(r) { segna = r }
                    }
                }
            }
            if (sc.senzaDataVoci > 0) Text("Senza data: " + Testo.quanti(sc.senzaDataVoci, "scadenza dei contratti", "scadenze dei contratti") + ", " + euro(sc.senzaDataEntrate) + " (non contano nel saldo)", style = Testi.secondario, color = c.tenue)
        }
    }
    segna?.let { r ->
        when {
            r.tipo == "fattura" && r.stato == "da_emettere" -> { segna = null; nav.vai("fattura/${r.id}") }
            r.tipo == "fattura" && scrive -> FoglioSegnaSoldi(dati, "Segna incassato", r.titolo, r.importo ?: 0.0, true, { segna = null },
                onSegna = { imp, data, conto, ver -> dati.fase4.segnaIncasso(r.id, imp, data, conto, ver).map { it.first.id } }, onFatto = { giro++; RicordoFatture.giro++ })
            r.tipo == "ricevuta" && scrive -> FoglioSegnaSoldi(dati, "Segna pagato", r.titolo, r.importo ?: 0.0, false, { segna = null },
                onSegna = { imp, data, conto, ver -> dati.fase4.segnaPagamento("ricevuta", r.id, imp, data, conto, ver).map { it.id } }, onFatto = { giro++ })
            r.tipo == "impegno" -> { segna = null; impegno = r.id }
            r.tipo == "fattura" -> { segna = null; nav.vai("fattura/${r.id}") }
            r.tipo == "ricevuta" -> { segna = null; nav.vai("ricevuta/${r.id}") }
            else -> segna = null
        }
    }
    impegno?.let { id -> FoglioImpegnoDaId(dati, id, scrive, { impegno = null }) { impegno = null; giro++ } }
}

/** Una riga dello scadenziario: + o −, cosa, chi e dettaglio, importo, la pillola. */
@Composable
private fun RigaScadenza(r: RigaScadenziario, onClick: () -> Unit) {
    val c = W.colori
    Row(
        Modifier.fillMaxWidth().heightIn(min = 64.dp).clickable(onClick = onClick).padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(if (r.entrata) "+" else "−", style = Testi.titoloSezione, color = if (r.entrata) c.firmatoTesto else c.testo2, modifier = Modifier.width(16.dp))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(r.titolo, style = Testi.forte.copy(fontWeight = FontWeight.Bold), color = c.testo, maxLines = 2, overflow = TextOverflow.Ellipsis)
            if (r.dettaglio.isNotBlank()) Text(r.dettaglio, style = Testi.secondario, color = if (r.stato == "scaduto") c.rossoTesto else c.tenue, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
        Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(if (r.importoDaScrivere) "da scrivere" else (if (r.entrata) "+ " else "− ") + euro(r.importo), style = Testi.secondarioGrande.copy(fontWeight = FontWeight.ExtraBold), color = c.testo)
            when (r.stato) {
                "scaduto" -> Pillolina(r.parola, c.rossoTesto, c.rossoTenue)
                "proposto", "in_parte" -> Pillolina(r.parola, c.gialloTesto, c.gialloTenue)
                "da_emettere" -> Pillolina(r.parola, c.inviatoTesto, c.inviatoFondo)
                else -> Pillolina(r.parola, c.fatturatoTesto, c.fatturatoFondo)
            }
        }
    }
}

// ---------------------------------------------------------------------------------- movimenti

private enum class FiltroMovimenti(val nome: String) { TUTTI("Tutti"), INCASSI("Incassi"), PAGAMENTI("Pagamenti"), DA_VERIFICARE("Da verificare") }

@Composable
private fun PaginaMovimenti(dati: Dati, scrive: Boolean) {
    val c = W.colori
    var testo by remember { mutableStateOf("") }
    var filtro by remember { mutableStateOf(FiltroMovimenti.TUTTI) }
    var giro by remember { mutableIntStateOf(0) }
    var aperto by remember { mutableStateOf<Movimento?>(null) }
    val lettura = rememberLettura(filtro to testo, giro + RicordoBanche.giro * 1000) {
        kotlinx.coroutines.delay(if (testo.isBlank()) 0 else 300)
        dati.fase4.movimenti(
            verso = when (filtro) { FiltroMovimenti.INCASSI -> "entrata"; FiltroMovimenti.PAGAMENTI -> "uscita"; else -> "" },
            verificato = if (filtro == FiltroMovimenti.DA_VERIFICARE) false else null, testo = testo,
        )
    }
    CampoCerca(testo, { testo = it }, "Cerca descrizione, chi, importo")
    PilloleFiltro(FiltroMovimenti.entries.map { it to it.nome }, filtro) { filtro = it }
    Scheda(orizzontale = 16.dp, verticale = 6.dp, spazio = 0.dp) { RigaNonCollegato("Importa estratto conto") }
    when (lettura) {
        is Lettura.InCorso -> Segnaposto(240.dp)
        is Lettura.Errore -> SchedaErrore(lettura.messaggio) { giro++ }
        is Lettura.Pronta -> SchedaElenco {
            if (lettura.dato.movimenti.isEmpty()) RigaCalma("Nessun movimento")
            lettura.dato.movimenti.forEachIndexed { i, m ->
                if (i > 0) LineaElenco()
                Row(Modifier.fillMaxWidth().heightIn(min = 68.dp).clickable { aperto = m }.padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(m.descrizione.ifBlank { m.soggetto.ifBlank { "Movimento" } }, style = Testi.forte.copy(fontWeight = FontWeight.Bold), color = if (m.annullato) c.tenue else c.testo, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        Text(listOf(dataBreve(m.data), m.soggetto, m.conto).filter { it.isNotBlank() }.joinToString(" · "), style = Testi.secondario, color = c.tenue, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text((if (m.entrata) "+ " else "− ") + euro(m.importo), style = Testi.forte, color = if (m.entrata) c.firmatoTesto else c.testo)
                        when {
                            m.annullato -> Pillolina("Annullato", c.fatturatoTesto, c.fatturatoFondo)
                            m.verificato -> Pillolina("Verificato in banca", c.firmatoTesto, c.firmatoFondo)
                            else -> Pillolina("Registrato", c.inviatoTesto, c.inviatoFondo)
                        }
                    }
                }
            }
        }
    }
    aperto?.let { m -> FoglioMovimento(dati, m, scrive, { aperto = null }) { aperto = null; giro++; RicordoFatture.giro++ } }
}

/** Un movimento: abbinamenti, la spunta "visto sull'estratto conto", Annulla col motivo. */
@Composable
private fun FoglioMovimento(dati: Dati, m: Movimento, scrive: Boolean, onChiudi: () -> Unit, onCambiato: () -> Unit) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    var annulla by remember { mutableStateOf(false) }
    var motivo by remember { mutableStateOf("") }
    FoglioDalBasso(onChiudi) {
        Text((if (m.entrata) "+ " else "− ") + euro(m.importo), style = Testi.titoloScheda, color = c.testo)
        Text(m.descrizione, style = Testi.testo, color = c.testo2)
        RigaDato("Data", dataIt(m.data))
        RigaDato("Conto", m.conto)
        if (m.soggetto.isNotBlank()) RigaDato("Chi", m.soggetto)
        RigaDato("Livello", if (m.verificato) "Verificato in banca" else "Registrato")
        m.abbinamenti.forEach { a -> RigaDato("Abbinato a " + a.etichetta, euro(a.importo)) }
        if (m.annullato) Text("Annullato: " + m.motivo, style = Testi.secondario, color = c.rossoTesto)
        if (scrive && !m.annullato && m.puoScrivere) {
            if (annulla) {
                CampoTesto(motivo, { motivo = it }, "Perché lo annulli", Modifier.fillMaxWidth())
                PulsanteBordo("Annulla il movimento", {
                    if (motivo.isBlank()) { avvisi.mostra("Motivo: scrivi perché lo annulli"); return@PulsanteBordo }
                    scope.launch { dati.fase4.annullaMovimento(m.id, motivo).onSuccess { avvisi.mostra("Movimento annullato"); onCambiato() }.onFailure { avvisi.mostra(spiegaErrore2(it, "Non si è annullato: riprova")) } }
                }, Modifier.fillMaxWidth(), icona = Icone.cestino)
            } else {
                PulsanteBordo(if (m.verificato) "Togli la spunta della banca" else "L'ho visto sull'estratto conto", {
                    scope.launch { dati.fase4.verificaMovimenti(listOf(m.id), !m.verificato).onSuccess { onCambiato() }.onFailure { avvisi.mostra(spiegaErrore2(it, "Non è cambiato: riprova")) } }
                }, Modifier.fillMaxWidth(), icona = Icone.spunta)
                PulsanteTesto("Annulla il movimento", { annulla = true }, Modifier.fillMaxWidth(), colore = c.rossoTesto)
            }
        }
    }
}

/** Una cosa aperta a cui abbinare un movimento: fattura (entrata), ricevuta o impegno (uscita). */
private data class DaAbbinare(val tipo: String, val id: String, val titolo: String, val residuo: Double)

@Composable
private fun FoglioNuovoMovimento(dati: Dati, onChiudi: () -> Unit, onFatto: () -> Unit) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    var entrata by remember { mutableStateOf(true) }
    var importo by remember { mutableStateOf("") }
    var data by remember { mutableStateOf(LocalDate.now()) }
    var conti by remember { mutableStateOf<List<ContoBanca>>(emptyList()) }
    var conto by remember { mutableStateOf("") }
    var descrizione by remember { mutableStateOf("") }
    var categoria by remember { mutableStateOf("incasso") }
    var verificato by remember { mutableStateOf(false) }
    var aperte by remember { mutableStateOf<List<DaAbbinare>>(emptyList()) }
    var abbinate by remember { mutableStateOf<Map<String, Double>>(emptyMap()) }
    var errore by remember { mutableStateOf<String?>(null) }
    var inCorso by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { dati.fase4.conti().onSuccess { l -> conti = l.filter { it.attivo }; conto = l.firstOrNull { it.predefinito }?.id ?: l.firstOrNull()?.id.orEmpty() } }
    LaunchedEffect(entrata) {
        abbinate = emptyMap()
        categoria = if (entrata) "incasso" else "pagamento"
        aperte = if (entrata) {
            (dati.fase4.fatture(FiltroFatture(pagamento = "aperta")).getOrDefault(emptyList()) + dati.fase4.fatture(FiltroFatture(stato = "pronta")).getOrDefault(emptyList()))
                .filter { (it.residuo ?: 0.0) > 0 && !it.nota }.map { DaAbbinare("fattura", it.id, it.etichetta + " · " + it.cliente, it.residuo ?: 0.0) }
        } else {
            dati.fase4.ricevute("da_pagare").getOrDefault(emptyList()).map { DaAbbinare("ricevuta", it.id, it.fornitore + " · fattura " + it.numero, it.daPagare ?: 0.0) } +
                dati.fase4.impegni("aperti").getOrDefault(emptyList()).filter { it.importo != null }.map { DaAbbinare("impegno", it.id, it.descrizione + " · " + dataBreve(it.scadenza), it.daPagare ?: it.importo ?: 0.0) }
        }
    }
    FoglioDalBasso(onChiudi) {
        Text("Nuovo movimento", style = Testi.titoloScheda, color = c.testo)
        Column(Modifier.heightIn(max = 580.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Segmenti(listOf(true to "Entrata", false to "Uscita"), entrata, { entrata = it })
            CampoImportoGrande(importo, { importo = it; errore = null }, null)
            PulsanteData("Data", data) { data = it }
            if (conti.size > 1) { Etichetta("Conto"); SceltaConto(conti, conto) { conto = it } }
            CampoTesto(descrizione, { descrizione = it }, "Descrizione", Modifier.fillMaxWidth())
            Etichetta("Categoria")
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Movimento.CATEGORIE.forEach { (k, n) -> Pillola(n, categoria == k, { categoria = k }, altezza = 44.dp) }
            }
            if (aperte.isNotEmpty()) {
                Etichetta("Abbina a…")
                aperte.forEach { a ->
                    val chiave = a.tipo + ":" + a.id
                    val scelta = chiave in abbinate
                    Row(Modifier.fillMaxWidth().heightIn(min = 52.dp), verticalAlignment = Alignment.CenterVertically) {
                        CasellaScelta(scelta, a.titolo) {
                            abbinate = if (scelta) abbinate - chiave else {
                                val resto = (importoScritto(importo) ?: a.residuo) - abbinate.values.sum()
                                abbinate + (chiave to minOf(a.residuo, if (resto > 0) resto else a.residuo))
                            }
                        }
                        Column(Modifier.weight(1f)) {
                            Text(a.titolo, style = Testi.secondarioGrande.copy(fontWeight = FontWeight.Bold), color = c.testo, maxLines = 2, overflow = TextOverflow.Ellipsis)
                            Text((if (a.tipo == "fattura") "da incassare " else "da pagare ") + euro(a.residuo) + if (scelta) " · abbino " + euro(abbinate[chiave]) else "", style = Testi.secondario, color = c.tenue)
                        }
                    }
                }
            }
            RigaCasella("L'ho visto sull'estratto conto", verificato) { verificato = !verificato }
            errore?.let { Text(it, style = Testi.secondario, color = c.rossoTesto) }
        }
        PulsantePrincipale(if (inCorso) "Salvo…" else "Salva il movimento", {
            val n = importoScritto(importo)
            if (inCorso) return@PulsantePrincipale
            if (n == null || n <= 0) { errore = "Importo: scrivi quanto"; return@PulsantePrincipale }
            if (conto.isBlank()) { errore = "Conto: prima scrivi il conto in Banche e scadenze › Conti"; return@PulsantePrincipale }
            val o = JSONObject().put("idConto", PonteServer.idJson(conto)).put("data", data.toString()).put("verso", if (entrata) "entrata" else "uscita")
                .put("importo", n).put("descrizione", descrizione.trim()).put("categoria", categoria).put("verificato", verificato)
                .put("abbinamenti", JSONArray().apply { abbinate.forEach { (k, v) -> put(JSONObject().put("tipo", k.substringBefore(':')).put("id", PonteServer.idJson(k.substringAfter(':'))).put("importo", v)) } })
            inCorso = true
            scope.launch {
                dati.fase4.salvaMovimento(o).onSuccess { avvisi.mostra("Movimento salvato"); onFatto() }.onFailure { errore = spiegaErrore2(it, "Il movimento non si è salvato: riprova") }
                inCorso = false
            }
        }, altezza = 56.dp, abilitato = !inCorso)
    }
}

// ---------------------------------------------------------------------------------- tributi

@Composable
private fun PaginaTributi(dati: Dati, scrive: Boolean) {
    val c = W.colori
    var giro by remember { mutableIntStateOf(0) }
    var stato by remember { mutableStateOf("aperti") }
    val lettura = rememberLettura(stato, giro + RicordoBanche.giro * 1000) { dati.fase4.impegni(stato) }
    var aperto by remember { mutableStateOf<Impegno?>(null) }
    PilloleFiltro(listOf("aperti" to "Da pagare", "pagati" to "Pagati", "tutti" to "Tutti"), stato) { stato = it }
    when (lettura) {
        is Lettura.InCorso -> Segnaposto(240.dp)
        is Lettura.Errore -> SchedaErrore(lettura.messaggio) { giro++ }
        is Lettura.Pronta -> SchedaElenco {
            val l = if (RicordoBanche.soloProposte) lettura.dato.filter { it.proposta } else lettura.dato
            if (l.isEmpty()) RigaCalma("Nessun tributo o rata")
            l.forEachIndexed { i, x ->
                if (i > 0) LineaElenco()
                Row(Modifier.fillMaxWidth().heightIn(min = 68.dp).clickable { aperto = x }.padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(x.descrizione, style = Testi.forte.copy(fontWeight = FontWeight.Bold), color = c.testo, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        Text(listOf(dataBreve(x.scadenza), if (x.codice.isNotBlank()) "codice " + x.codice else "", if (x.ripete.isNotBlank()) "Ripete " + x.ripete else "").filter { it.isNotBlank() }.joinToString(" · "),
                            style = Testi.secondario, color = if (x.scaduto) c.rossoTesto else c.tenue)
                    }
                    Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(if (x.importoDaScrivere) "da scrivere" else euro(x.importo), style = Testi.forte, color = c.testo)
                        PillolaStato4(x.statoVisto)
                    }
                }
            }
        }
    }
    if (RicordoBanche.soloProposte) PulsanteTesto("Mostra tutti", { RicordoBanche.soloProposte = false })
    aperto?.let { x -> FoglioImpegno(dati, x, scrive, { aperto = null }) { aperto = null; giro++ } }
}

@Composable
private fun FoglioImpegnoDaId(dati: Dati, id: String, scrive: Boolean, onChiudi: () -> Unit, onCambiato: () -> Unit) {
    val lettura = rememberLettura(id, 0) { dati.fase4.impegni("tutti").map { l -> l.firstOrNull { it.id == id } ?: throw PonteServer.Rifiutato("Impegno non trovato") } }
    when (lettura) {
        is Lettura.Pronta -> FoglioImpegno(dati, lettura.dato, scrive, onChiudi, onCambiato)
        is Lettura.Errore -> { val avvisi = LocalAvvisi.current; LaunchedEffect(Unit) { avvisi.mostra(lettura.messaggio); onChiudi() } }
        else -> {}
    }
}

/** Un tributo, F24 o rata: Segna pagato (giallo), Conferma per una proposta, Cambia, Togli. */
@Composable
private fun FoglioImpegno(dati: Dati, x: Impegno, scrive: Boolean, onChiudi: () -> Unit, onCambiato: () -> Unit) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    var paga by remember { mutableStateOf(false) }
    var cambia by remember { mutableStateOf(false) }
    var togli by remember { mutableStateOf(false) }
    if (paga) {
        FoglioSegnaSoldi(dati, "Segna pagato", x.descrizione, x.daPagare ?: x.importo ?: 0.0, false, { paga = false },
            onSegna = { imp, data, conto, ver -> dati.fase4.segnaPagamento("impegno", x.id, imp, data, conto, ver).map { it.id } }, onFatto = onCambiato)
        return
    }
    if (cambia) { FoglioTributo(dati, x, { cambia = false }) { cambia = false; onCambiato() }; return }
    FoglioDalBasso(onChiudi) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(x.descrizione, style = Testi.titoloScheda, color = c.testo, modifier = Modifier.weight(1f))
            PillolaStato4(x.statoVisto)
        }
        RigaDato("Scadenza", dataIt(x.scadenza))
        if (x.codice.isNotBlank()) RigaDato("Codice", x.codice)
        RigaDato("Importo", if (x.importoDaScrivere) "da scrivere" else euro(x.importo))
        if ((x.pagato ?: 0.0) > 0) RigaDato("Pagato", euro(x.pagato))
        if (x.ripete.isNotBlank()) RigaDato("Ripete", x.ripete)
        if (x.note.isNotBlank()) Text(x.note, style = Testi.secondario, color = c.tenue)
        if (scrive && x.puoScrivere && x.stato != "pagato" && !x.annullato) {
            if (x.proposta) PulsanteBordo("Conferma la proposta", {
                scope.launch { dati.fase4.confermaImpegno(x.id, null).onSuccess { avvisi.mostra("Proposta confermata"); onCambiato() }.onFailure { avvisi.mostra(spiegaErrore2(it, "Non è stata confermata: riprova")) } }
            }, Modifier.fillMaxWidth(), icona = Icone.spunta)
            PulsanteBordo("Cambia", { cambia = true }, Modifier.fillMaxWidth(), icona = Icone.matita)
            if (x.importoDaScrivere) Text("Scrivi l'importo con Cambia, poi segnalo pagato", style = Testi.secondario, color = c.gialloTesto)
            else PulsantePrincipale("Segna pagato", { paga = true }, altezza = 56.dp)
            PulsanteTesto("Togli", { togli = true }, Modifier.fillMaxWidth(), colore = c.rossoTesto)
        }
    }
    if (togli) {
        FoglioDalBasso({ togli = false }) {
            Text("Togliere ${x.descrizione}?", style = Testi.titoloScheda, color = c.testo)
            val scelte = if (x.idRicorrenza.isNotBlank()) listOf("questa" to "Solo questa", "future" to "Da questa in poi", "tutte" to "Tutte") else listOf("questa" to "Togli")
            scelte.forEach { (k, nome) ->
                PulsanteBordo(nome, {
                    togli = false
                    scope.launch {
                        dati.fase4.togliImpegno(x.id, if (x.idRicorrenza.isNotBlank()) k else null, "tolto dal telefono")
                            .onSuccess { n -> avvisi.mostra(if (n > 1) "Tolti $n" else "Tolto"); onCambiato() }.onFailure { avvisi.mostra(spiegaErrore2(it, "Non è stato tolto: riprova")) }
                    }
                }, Modifier.fillMaxWidth())
            }
            PulsanteTesto("Annulla", { togli = false }, Modifier.fillMaxWidth(), colore = c.testo)
        }
    }
}

/** Nuovo tributo o cambia: tipo, descrizione, codice, scadenza, importo (anche vuoto), ripeti. */
@Composable
private fun FoglioTributo(dati: Dati, x: Impegno?, onChiudi: () -> Unit, onFatto: () -> Unit) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    var tipo by remember { mutableStateOf(x?.tipo ?: "f24") }
    var descrizione by remember { mutableStateOf(x?.descrizione.orEmpty()) }
    var codice by remember { mutableStateOf(x?.codice.orEmpty()) }
    var scadenza by remember { mutableStateOf(x?.scadenza?.let(::dataDi) ?: LocalDate.now().withDayOfMonth(16).let { if (it.isBefore(LocalDate.now())) it.plusMonths(1) else it }) }
    var importo by remember { mutableStateOf(importoNelCampo(x?.importo)) }
    var ripeti by remember { mutableStateOf(x?.ricorrenza?.let { r -> if (r.regola == "anni") "anno" else "${r.ogni}" } ?: "mai") }
    var perRicorrenza by remember { mutableStateOf("questa") }
    var errore by remember { mutableStateOf<String?>(null) }
    var inCorso by remember { mutableStateOf(false) }
    FoglioDalBasso(onChiudi) {
        Text(if (x == null) "Nuovo tributo" else "Cambia", style = Testi.titoloScheda, color = c.testo)
        Column(Modifier.heightIn(max = 560.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) { Impegno.TIPI.forEach { (k, n) -> Pillola(n, tipo == k, { tipo = k }, altezza = 44.dp) } }
            CampoTesto(descrizione, { descrizione = it; errore = null }, "Descrizione", Modifier.fillMaxWidth())
            CampoTesto(codice, { codice = it }, "Codice", Modifier.fillMaxWidth(), segnaposto = "1040, 6033")
            PulsanteData("Scadenza", scadenza) { scadenza = it }
            CampoTesto(importo, { importo = it }, "Importo", Modifier.fillMaxWidth(), tastiera = KeyboardType.Decimal, suffisso = "€")
            Etichetta("Ripeti")
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("mai" to "Mai", "1" to "Ogni mese", "3" to "Ogni 3 mesi", "anno" to "Ogni anno").forEach { (k, n) -> Pillola(n, ripeti == k, { ripeti = k }, altezza = 44.dp) }
            }
            if (x?.idRicorrenza?.isNotBlank() == true) {
                Etichetta("Cosa cambia")
                Segmenti(listOf("questa" to "Solo questa", "future" to "Da qui", "tutte" to "Tutte"), perRicorrenza, { perRicorrenza = it })
            }
            errore?.let { Text(it, style = Testi.secondario, color = c.rossoTesto) }
        }
        PulsantePrincipale(if (inCorso) "Salvo…" else "Salva", {
            if (inCorso) return@PulsantePrincipale
            if (descrizione.isBlank()) { errore = "Descrizione: scrivi cosa si paga"; return@PulsantePrincipale }
            val n = if (importo.isBlank()) null else importoScritto(importo) ?: run { errore = "Importo: non è un numero"; return@PulsantePrincipale }
            val o = JSONObject().put("tipo", tipo).put("descrizione", descrizione.trim()).put("codice", codice.trim()).put("scadenza", scadenza.toString())
                .put("importo", n ?: JSONObject.NULL)
                .put("ricorrenza", when (ripeti) { "mai" -> JSONObject.NULL; "anno" -> JSONObject().put("regola", "anni").put("ogni", 1); else -> JSONObject().put("regola", "mesi").put("ogni", ripeti.toInt()) })
            if (x != null) o.put("id", PonteServer.idJson(x.id))
            inCorso = true
            scope.launch {
                dati.fase4.salvaImpegno(o, if (x?.idRicorrenza?.isNotBlank() == true) perRicorrenza else null)
                    .onSuccess { avvisi.mostra("Salvato"); onFatto() }.onFailure { errore = spiegaErrore2(it, "Non si è salvato: riprova") }
                inCorso = false
            }
        }, altezza = 56.dp, abilitato = !inCorso)
    }
}

// ---------------------------------------------------------------------------------- conti

@Composable
private fun PaginaConti(dati: Dati, scrive: Boolean) {
    val c = W.colori
    var giro by remember { mutableIntStateOf(0) }
    val lettura = rememberLettura(Unit, giro + RicordoBanche.giro * 1000) { dati.fase4.conti(tutti = true) }
    var aperto by remember { mutableStateOf<ContoBanca?>(null) }
    when (lettura) {
        is Lettura.InCorso -> Segnaposto(140.dp)
        is Lettura.Errore -> SchedaErrore(lettura.messaggio) { giro++ }
        is Lettura.Pronta -> {
            if (lettura.dato.isEmpty()) Scheda(orizzontale = 18.dp, verticale = 16.dp) { RigaCalma("Nessun conto: scrivi il conto dello studio") }
            lettura.dato.forEach { k ->
                Scheda(orizzontale = 18.dp, verticale = 14.dp, spazio = 4.dp, modifier = if (scrive) Modifier.clickable { aperto = k } else Modifier) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(k.nome + if (!k.attivo) " (chiuso)" else "", style = Testi.forteGrande, color = c.testo)
                            Text(listOf(if (k.ultimeCifre.isNotBlank()) "…" + k.ultimeCifre else "", k.banca, if (k.predefinito) "predefinito" else "").filter { it.isNotBlank() }.joinToString(" · "), style = Testi.secondario, color = c.tenue)
                        }
                        Text(euro(k.saldo), style = Testi.titoloSezione, color = c.testo)
                    }
                    Text(
                        if (k.saldoAl.isNotBlank()) "dall'ultimo saldo scritto il " + dataBreve(k.saldoAl) + " · " + Testo.quanti(k.movimentiDopo, "movimento dopo", "movimenti dopo") else "senza un saldo scritto: contano tutti i movimenti",
                        style = Testi.secondario, color = c.tenue,
                    )
                }
            }
        }
    }
    Scheda(orizzontale = 16.dp, verticale = 6.dp, spazio = 0.dp) { RigaNonCollegato("Collegamento alla banca") }
    aperto?.let { k -> FoglioConto(dati, k, { aperto = null }) { aperto = null; giro++ } }
}

@Composable
private fun FoglioAggiornaSaldo(dati: Dati, onChiudi: () -> Unit, onFatto: () -> Unit) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    var conti by remember { mutableStateOf<List<ContoBanca>>(emptyList()) }
    var conto by remember { mutableStateOf("") }
    var saldo by remember { mutableStateOf("") }
    var data by remember { mutableStateOf(LocalDate.now()) }
    var errore by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) { dati.fase4.conti().onSuccess { l -> conti = l; conto = l.firstOrNull { it.predefinito }?.id ?: l.firstOrNull()?.id.orEmpty() } }
    FoglioDalBasso(onChiudi) {
        Text("Aggiorna il saldo", style = Testi.titoloScheda, color = c.testo)
        if (conti.size > 1) SceltaConto(conti, conto) { conto = it }
        Text("Saldo letto in banca", style = Testi.secondarioGrande.copy(fontWeight = FontWeight.Bold), color = c.testo)
        CampoImportoGrande(saldo, { saldo = it; errore = null }, errore)
        PulsanteData("Il giorno del saldo", data) { data = it }
        PulsantePrincipale("Salva il saldo", {
            val n = Numeri4Saldo.leggi(saldo) ?: run { errore = "Saldo: scrivi il saldo letto in banca"; return@PulsantePrincipale }
            if (conto.isBlank()) { errore = "Prima scrivi il conto dello studio"; return@PulsantePrincipale }
            scope.launch { dati.fase4.aggiornaSaldo(conto, n, data).onSuccess { avvisi.mostra("Saldo aggiornato"); onFatto() }.onFailure { errore = spiegaErrore2(it, "Il saldo non si è salvato: riprova") } }
        }, altezza = 56.dp)
    }
}

/** Il saldo può essere anche negativo. */
private object Numeri4Saldo {
    fun leggi(t: String): Double? = eu.stgm.wisper.rapportino.Numeri.leggi(t.replace("€", ""))?.let { Math.round(it * 100) / 100.0 }
}

/** Nuovo conto o i dati di uno: nome, banca, IBAN intero (solo qui), predefinito, soglia. */
@Composable
private fun FoglioConto(dati: Dati, k: ContoBanca?, onChiudi: () -> Unit, onFatto: () -> Unit) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    var nome by remember { mutableStateOf(k?.nome.orEmpty()) }
    var banca by remember { mutableStateOf(k?.banca.orEmpty()) }
    var iban by remember { mutableStateOf(k?.iban.orEmpty()) }
    var predefinito by remember { mutableStateOf(k?.predefinito ?: false) }
    var soglia by remember { mutableStateOf(importoNelCampo(k?.soglia)) }
    var attivo by remember { mutableStateOf(k?.attivo ?: true) }
    var errore by remember { mutableStateOf<String?>(null) }
    FoglioDalBasso(onChiudi) {
        Text(if (k == null) "Nuovo conto" else k.nome, style = Testi.titoloScheda, color = c.testo)
        Column(Modifier.heightIn(max = 560.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            CampoTesto(nome, { nome = it }, "Nome", Modifier.fillMaxWidth(), segnaposto = "Conto studio")
            CampoTesto(banca, { banca = it }, "Banca", Modifier.fillMaxWidth())
            CampoTesto(iban, { iban = it.uppercase().replace(" ", "") }, "IBAN", Modifier.fillMaxWidth(),
                errore = if (iban.length >= 15 && !ContoBanca.ibanValido(iban)) "IBAN: non sembra giusto" else null)
            CampoTesto(soglia, { soglia = it }, "Soglia sotto cui avvisare", Modifier.fillMaxWidth(), tastiera = KeyboardType.Decimal, suffisso = "€", segnaposto = "quella delle impostazioni")
            RigaSiNo("Predefinito", predefinito) { predefinito = it }
            if (k != null) RigaSiNo("Aperto", attivo) { attivo = it }
            errore?.let { Text(it, style = Testi.secondario, color = c.rossoTesto) }
        }
        PulsantePrincipale("Salva il conto", {
            if (nome.isBlank()) { errore = "Nome: scrivi il nome del conto"; return@PulsantePrincipale }
            if (iban.isNotBlank() && !ContoBanca.ibanValido(iban)) { errore = "IBAN: non sembra giusto"; return@PulsantePrincipale }
            val o = JSONObject().put("nome", nome.trim()).put("banca", banca.trim()).put("predefinito", predefinito).put("attivo", attivo)
                .put("soglia", if (soglia.isBlank()) JSONObject.NULL else (importoScritto(soglia) ?: run { errore = "Soglia: non è un numero"; return@PulsantePrincipale }))
            // L'IBAN si manda solo se si vede intero (chi ha banche in scrittura): mai "…3456" al posto di quello vero.
            if (iban.isNotBlank() || k == null) o.put("iban", iban)
            if (k != null) o.put("id", PonteServer.idJson(k.id))
            scope.launch { dati.fase4.salvaConto(o).onSuccess { avvisi.mostra("Conto salvato"); onFatto() }.onFailure { errore = spiegaErrore2(it, "Il conto non si è salvato: riprova") } }
        }, altezza = 56.dp)
    }
}

// ---------------------------------------------------------------------------------- situazione

/** La situazione finanziaria (§10.4, §13.5), un livello sotto sul telefono. Nessun giallo. */
@Composable
fun SchermataSituazione(dati: Dati, nav: Navigatore) {
    val c = W.colori
    var giro by remember { mutableIntStateOf(0) }
    val lettura = rememberLettura(Unit, giro) { dati.fase4.situazione() }
    Column(
        Modifier.fillMaxSize().background(c.fondo).verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = 40.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Testata(onIndietro = { nav.indietro() })
        TitoloPagina("Situazione")
        when (lettura) {
            is Lettura.InCorso -> { Segnaposto(160.dp); Segnaposto(200.dp) }
            is Lettura.Errore -> SchedaErrore(lettura.messaggio) { giro++ }
            is Lettura.Pronta -> {
                val s: Situazione = lettura.dato
                val soglia = s.soglia ?: 0.0
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    RiquadroEuro("Nei conti oggi", s.saldoOggi, Modifier.weight(1f))
                    RiquadroEuro("Da incassare", s.daIncassare, Modifier.weight(1f), nota = s.scadutoDaIncassare?.takeIf { it > 0 }?.let { "scaduto " + euro(it) })
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    RiquadroEuro("Da pagare in 30 giorni", s.daPagare30, Modifier.weight(1f), nota = s.scadutoDaPagare?.takeIf { it > 0 }?.let { "scaduto " + euro(it) })
                    RiquadroEuro("Previsto fra 30 giorni", s.previsto30, Modifier.weight(1f), rosso = (s.previsto30 ?: 0.0) < soglia, nota = "fra 60: " + euro(s.previsto60))
                }
                if (s.primoSottoSoglia.isNotBlank()) Text(
                    "Primo giorno sotto soglia: " + giornoDi(s.primoSottoSoglia), style = Testi.forte, color = c.rossoTesto,
                    modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(c.rossoTenue).padding(12.dp),
                )
                TitoloSezione("Saldo previsto a fine settimana")
                Scheda(orizzontale = 14.dp, verticale = 14.dp) {
                    val massimo = (s.settimane.mapNotNull { it.saldo }.maxOrNull() ?: 1.0).coerceAtLeast(soglia).coerceAtLeast(1.0)
                    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.Bottom) {
                        s.settimane.forEach { w ->
                            val v = (w.saldo ?: 0.0).coerceAtLeast(0.0)
                            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp),
                                modifier = Modifier.width(52.dp).semantics { contentDescription = "Settimana dal ${dataBreve(w.da)}: " + euro(w.saldo) + if (w.sottoSoglia) ", sotto soglia" else "" }) {
                                Text(euroCorto(w.saldo), style = Testi.piccolo.copy(fontSize = 10.sp), color = if (w.sottoSoglia) c.rossoTesto else c.testo2, maxLines = 1)
                                Box(Modifier.width(28.dp).height((8 + 120 * (v / massimo)).dp).clip(RoundedCornerShape(6.dp)).background(if (w.sottoSoglia) c.rossoPieno else c.testo))
                                Text(dataBreve(w.da), style = Testi.piccolo.copy(fontSize = 10.sp), color = c.tenue, maxLines = 1)
                            }
                        }
                    }
                    Text("Soglia " + euro(soglia) + ": le barre rosse sono sotto soglia", style = Testi.secondario, color = c.tenue)
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    RiquadroEuro("Fatturato dell'anno", s.fatturatoAnno, Modifier.weight(1f))
                    RiquadroEuro("Incassato dell'anno", s.incassatoAnno, Modifier.weight(1f))
                }
                s.saldi.forEach { (_, nome, saldo) -> RigaDato(nome, euro(saldo)) }
                Scheda(orizzontale = 16.dp, verticale = 6.dp, spazio = 0.dp) { RigaNonCollegato("Collegamento alla banca") }
            }
        }
    }
}

/** "8,7k" sopra le barre strette. */
private fun euroCorto(n: Double?): String {
    if (n == null) return "—"
    return if (Math.abs(n) >= 1000) eu.stgm.wisper.rapportino.Numeri.scrivi(Math.round(n / 100) / 10.0) + "k" else eu.stgm.wisper.rapportino.Numeri.scrivi(Math.round(n).toDouble())
}

// ---------------------------------------------------------------------------------- una fattura ricevuta

/** Una fattura ricevuta (§13.2): conti, scadenze, pagamenti, categoria e commessa; giallo Segna pagata. */
@Composable
fun SchermataRicevuta(dati: Dati, nav: Navigatore, id: String) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    val scrive = scriveFatture()
    var giro by remember { mutableIntStateOf(0) }
    val lettura = rememberLettura(id, giro) { dati.fase4.ricevuta(id) }
    var paga by remember { mutableStateOf(false) }
    var commessa by remember { mutableStateOf(false) }
    var annulla by remember { mutableStateOf(false) }
    var motivo by remember { mutableStateOf("") }
    val r = (lettura as? Lettura.Pronta)?.dato
    fun salva(campi: JSONObject) {
        val x = r ?: return
        scope.launch {
            dati.fase4.salvaRicevuta(campi.put("id", PonteServer.idJson(x.id)))
                .onSuccess { avvisi.mostra("Salvato"); giro++ }.onFailure { avvisi.mostra(spiegaErrore2(it, "Non si è salvato: riprova")) }
        }
    }
    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = 130.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Testata(onIndietro = { nav.indietro() }) { if (scrive && r != null && (r.pagato ?: 0.0) == 0.0 && r.stato != "annullata") PulsanteTondo(Icone.altro, "Altre azioni", { annulla = true }) }
            when {
                lettura is Lettura.Errore -> SchedaErrore(lettura.messaggio) { giro++ }
                r == null -> { Segnaposto(120.dp); Segnaposto(200.dp) }
                else -> {
                    PillolaStato4(r.statoVisto)
                    TitoloPagina(r.fornitore, sopra = "Fattura ricevuta " + r.numero + " · " + dataIt(r.data))
                    Scheda(orizzontale = 18.dp, verticale = 14.dp, spazio = 2.dp) {
                        r.imponibile?.let { RigaDato("Imponibile", euro(it)) }
                        r.iva?.let { RigaDato("IVA", euro(it)) }
                        RigaDato("Totale", euro(r.totale))
                        if ((r.ritenuta ?: 0.0) > 0) RigaDato("Ritenuta (la versi tu con l'F24 1040)", "− " + euro(r.ritenuta))
                        RigaDato("Da pagare al fornitore", euro(r.netto))
                        if ((r.pagato ?: 0.0) > 0) RigaDato("Pagato", euro(r.pagato))
                        RigaDato("Restano", euro(r.daPagare), if (r.scaduta) c.rossoTesto else c.testo)
                    }
                    r.scadenze.forEach { s -> RigaDato("Scadenza " + dataIt(s.data), euro(s.importo), if (r.scaduta) c.rossoTesto else c.testo) }
                    if (r.scadenzaStimata) Text("Scadenza non scritta nella fattura: messa a 30 giorni", style = Testi.secondario, color = c.gialloTesto)
                    r.pagamenti.forEach { p -> RigaDato("Pagata il " + dataIt(p.data) + if (p.verificato) " · Verificato in banca" else " · Registrato", euro(p.importo)) }
                    if (r.descrizione.isNotBlank()) Text(r.descrizione, style = Testi.secondario, color = c.tenue)
                    Etichetta("Categoria")
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Ricevuta.CATEGORIE.forEach { (k, n) -> Pillola(n, r.categoria == k, { if (scrive && r.categoria != k) salva(JSONObject().put("categoria", k)) }, altezza = 44.dp) }
                    }
                    RigaVoce("Commessa", sotto = if (r.idCommessa.isNotBlank()) r.idCommessa + " · " + r.commessa else "Nessuna", icona = Icone.commesse, onClick = if (scrive) ({ commessa = true }) else null)
                }
            }
        }
        if (scrive && r != null && (r.daPagare ?: 0.0) > 0 && r.stato != "annullata") FondoConPulsante(Modifier.align(Alignment.BottomCenter)) {
            PulsantePrincipale("Segna pagata", { paga = true })
        }
    }
    if (paga && r != null) FoglioSegnaSoldi(dati, "Segna pagata", r.fornitore + " · fattura " + r.numero, r.daPagare ?: 0.0, false, { paga = false },
        onSegna = { imp, data, conto, ver -> dati.fase4.segnaPagamento("ricevuta", r.id, imp, data, conto, ver).map { it.id } }, onFatto = { giro++; RicordoFatture.giro++ })
    if (commessa && r != null) FoglioSceltaCommessa(ana, r.idCommessa, { idC -> commessa = false; salva(JSONObject().put("idCommessa", idC.ifBlank { JSONObject.NULL })) }, { commessa = false })
    if (annulla && r != null) FoglioDalBasso({ annulla = false }) {
        Text("Annullare la fattura ricevuta?", style = Testi.titoloScheda, color = c.testo)
        CampoTesto(motivo, { motivo = it }, "Perché la annulli", Modifier.fillMaxWidth())
        PulsanteBordo("Annulla la fattura ricevuta", {
            if (motivo.isBlank()) { avvisi.mostra("Motivo: scrivi perché la annulli"); return@PulsanteBordo }
            annulla = false
            scope.launch { dati.fase4.annullaRicevuta(r.id, motivo).onSuccess { avvisi.mostra("Annullata"); giro++ }.onFailure { avvisi.mostra(spiegaErrore2(it, "Non è stata annullata: riprova")) } }
        }, Modifier.fillMaxWidth(), icona = Icone.cestino)
    }
}
