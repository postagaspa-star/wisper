package eu.stgm.wisper.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.interaction.MutableInteractionSource
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
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import eu.stgm.wisper.Dati
import eu.stgm.wisper.Riepiloghi
import eu.stgm.wisper.rapportino.AzioneCasa
import eu.stgm.wisper.rapportino.Casa
import eu.stgm.wisper.rapportino.Collegamento
import eu.stgm.wisper.rapportino.Giornate
import eu.stgm.wisper.rapportino.Moduli
import eu.stgm.wisper.rapportino.Numeri
import eu.stgm.wisper.rapportino.Riferimento7
import eu.stgm.wisper.rapportino.SchedaImportante
import eu.stgm.wisper.rapportino.VoceDashboard
import kotlinx.coroutines.delay
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

private val IT = Locale.ITALY

/** Quello che la casa ricorda finché l'app è aperta. */
internal object RicordoCasa {
    /** La cascata d'entrata si vede una volta sola per apertura: tornando a casa i pezzi sono già lì. */
    var entrata = false

    /** Le fatture a cui si è già preparato il promemoria: la scheda gialla passa alla cosa dopo. */
    val mandati = mutableStateListOf<String>()
    var ultimoMandato by mutableStateOf<SchedaImportante?>(null)
}

/**
 * La casa del design Fai (docs/gestionale/fai.md §5, prototipo docs/prototipo/Fai-telefono.dc.html): la cosa più
 * importante su una scheda gialla, "Cosa vuoi fare?" con le azioni e Da sistemare. Le voci sono quelle della Dashboard
 * del server; qui si decide solo come si mostrano (rapportino/Casa.kt).
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SchermataCasa(dati: Dati, nav: Navigatore, onNuovo: (LocalDate) -> Unit) {
    val c = W.colori
    val perm = LocalPermessi.current
    val visita = LocalVisita.current
    val sessione by dati.sessione.collectAsStateWithLifecycle()
    val dashboard by dati.dashboard.collectAsStateWithLifecycle()
    val aggiornamento by dati.aggiornamento.collectAsStateWithLifecycle()
    val viste by dati.viste.collectAsStateWithLifecycle()
    val nome = sessione.utente.nome.substringBefore(' ').trim()
    val scrive = perm.modifica(Moduli.RAPPORTINI)
    var nascondi by remember { mutableStateOf<VoceDashboard?>(null) }
    var approvare by remember { mutableStateOf<VoceDashboard?>(null) }
    var promemoria by remember { mutableStateOf<SchedaImportante?>(null) }

    LaunchedEffect(Unit) { dati.aggiornaDashboard() }

    fun apri(col: Collegamento?) = apriCollegamento(col, nav, viste.map { it.rapportino })
    fun apriVoce(v: VoceDashboard) {
        if (v.tipo == "approvare" && (v.pezzi.isNotEmpty() || v.collegamento == null)) approvare = v else apri(v.collegamento)
    }
    fun fai(a: AzioneCasa) {
        when (a.chiave) {
            "rapportino" -> { visita?.azione("scrivi"); onNuovo(LocalDate.now()) }
            "spesa" -> nav.vai("spesa-veloce")
            "commessa" -> nav.vai("commessa-nuova")
            "cliente" -> nav.vai("cliente-nuovo")
            "preventivo" -> nav.vai("preventivo-nuovo")
            "invia" -> nav.sezione(Sezione.RAPPORTINI, FiltroRapportini(mese = null, quali = Quali.INVIARE))
        }
    }
    val quantiDaInviare = remember(viste) { Giornate.raggruppa(Riepiloghi.daInviare(viste)) { it.rapportino }.size }
    val entra = !RicordoCasa.entrata
    val scorriCasa = rememberScrollState()
    // La visita guidata porta a vista quello che illumina: Vedi tutto sta sotto alle tessere.
    val puntoVisita = visita?.takeIf { it.attiva }?.corrente?.bersaglio
    LaunchedEffect(puntoVisita) {
        if (puntoVisita == "altre") scorriCasa.animateScrollTo(scorriCasa.maxValue)
        else if (puntoVisita != null) scorriCasa.animateScrollTo(0)
    }
    LaunchedEffect(Unit) { delay(900); RicordoCasa.entrata = true }

    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(Modifier.fillMaxSize()) {
            TestataCasa()
            Column(
                Modifier.weight(1f).fillMaxWidth().verticalScroll(scorriCasa)
                    .padding(horizontal = 20.dp).padding(top = 8.dp, bottom = 96.dp),
                verticalArrangement = Arrangement.spacedBy(24.dp),
            ) {
                if (scrive) AvvisoRifiuto(dati)
                Column(Modifier.entrata(0, entra)) {
                    Text(
                        LocalDate.now().format(DateTimeFormatter.ofPattern("EEEE d MMMM", IT)).replaceFirstChar { it.uppercase() },
                        style = Testi.secondarioGrande, color = c.tenue,
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(if (nome.isNotBlank()) "Ciao $nome" else "Ciao", style = Testi.titoloCasa, color = c.testo, modifier = Modifier.semantics { heading() })
                }

                val d = dashboard
                val filtra: (List<VoceDashboard>) -> List<VoceDashboard> = { l ->
                    l.filter { v -> !(v.collegamento?.pagina == "fattura" && v.collegamento.id in RicordoCasa.mandati) && !v.delleOre }
                }
                val ds = d?.let { Casa.daSistemare(filtra(it.urgenti), filtra(it.settimana), filtra(it.pianificare), it.quante, 3) }

                RicordoCasa.ultimoMandato?.let { Mandato(it) }
                when {
                    d == null && aggiornamento.errore.isNotBlank() && !aggiornamento.inCorso -> Scheda(orizzontale = 20.dp, verticale = 18.dp) {
                        Text(aggiornamento.errore, style = Testi.testo, color = c.testo2)
                        PulsanteBordo("Riprova", { dati.aggiorna() }, Modifier.fillMaxWidth(), icona = Icone.riapri)
                    }
                    d == null || ds == null -> Segnaposto(190.dp)
                    ds.prima != null -> {
                        val v = ds.prima
                        val s = Casa.schedaImportante(v)
                        val conPromemoria = s.idFattura != null && perm.modifica(Moduli.COMUNICAZIONI) && perm.modifica(Moduli.FATTURAZIONE) && perm.costi
                        SchedaGialla(
                            s, if (conPromemoria) "Manda un promemoria" else azioneDi(v.collegamento), conPromemoria, Modifier.bersaglio("cosa-fare").entrata(1, entra),
                        ) { if (conPromemoria) promemoria = s else apriVoce(v) }
                    }
                    else -> NienteDaSistemare(Modifier.bersaglio("cosa-fare").entrata(1, entra))
                }

                val azioni = Casa.azioniDi { perm.modifica(it) }
                if (azioni.isNotEmpty()) Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("Cosa vuoi fare?", style = Testi.sezioneCasa, color = c.testo, modifier = Modifier.padding(bottom = 2.dp).semantics { heading() }.entrata(2, entra))
                    azioni.forEachIndexed { i, a ->
                        TesseraAzione(
                            a, prima = i == 0, numero = if (a.chiave == "invia") quantiDaInviare else 0,
                            modifier = Modifier.entrata(3 + i, entra).then(if (a.chiave == "rapportino") Modifier.bersaglio("scrivi") else Modifier),
                        ) { fai(a) }
                    }
                }

                if (d != null && ds != null) Column(Modifier.entrata(9, entra), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Da sistemare", style = Testi.sezioneCasa, color = c.testo, modifier = Modifier.weight(1f).semantics { heading() })
                        Box(
                            Modifier.bersaglio("altre").height(48.dp).clip(RoundedCornerShape(12.dp))
                                .clickable { RicordoTutto.sezione = "urgenti"; RicordoTutto.area = ""; nav.vai("tutto") }
                                .semantics { role = Role.Button }.padding(horizontal = 6.dp),
                            contentAlignment = Alignment.Center,
                        ) { Text("Vedi tutto", style = Testi.secondarioGrande.copy(fontWeight = FontWeight.Bold), color = c.collegamento) }
                    }
                    if (ds.righe.isEmpty()) RigaCalmaCasa(if (ds.prima != null) "Nient'altro da sistemare" else "Niente da sistemare oggi")
                    ds.righe.forEach { v -> RigaCasa(v, { apriVoce(v) }, if (v.nascondibile) ({ nascondi = v }) else null) }
                }

                // Fase 6 (§12.7): l'esterno vede i suoi incarichi con l'avanzamento.
                if (d != null && d.incarichiEsterno.isNotEmpty()) Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Etichetta("I tuoi incarichi · ${d.incarichiEsterno.size}")
                    Scheda(orizzontale = 18.dp, verticale = 4.dp, raggio = 22.dp, spazio = 0.dp) {
                        d.incarichiEsterno.forEachIndexed { i, x ->
                            if (i > 0) LineaElenco()
                            Column(Modifier.fillMaxWidth().clickable { apri(Collegamento("incarico", id = x.id)) }.padding(vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                Text(x.numero + " · " + x.titolo, style = Testi.forte, color = c.testo)
                                Text(listOf(x.idCommessa, x.commessa).filter { it.isNotBlank() }.joinToString(" · ") + if (x.modo == "corpo") " · avanzamento ${x.avanzamento}%" else "", style = Testi.secondario, color = c.tenue)
                                if (x.modo == "corpo") BarraAvanzamento(x.avanzamento)
                            }
                        }
                    }
                }
                VersioneNuova(dati)
            }
        }
        if (scrive) PillolaReteRapportini(dati, Modifier.align(Alignment.BottomCenter))
    }
    nascondi?.let { v -> FoglioNascondi(dati, v) { nascondi = null } }
    approvare?.let { v -> FoglioDaApprovare(v, "", nav, dati) { approvare = null } }
    promemoria?.let { s -> FoglioPromemoria(dati, s) { promemoria = null } }
}

/** Entra da sotto con la cascata del prototipo (340 ms, 50 ms fra un pezzo e l'altro); una volta sola per apertura. */
@Composable
private fun Modifier.entrata(ordine: Int, attiva: Boolean): Modifier {
    if (!attiva) return this
    val t = remember { Animatable(0f) }
    LaunchedEffect(Unit) {
        delay(ordine * 50L)
        t.animateTo(1f, tween(340, easing = FastOutSlowInEasing))
    }
    return graphicsLayer {
        alpha = t.value
        translationY = (1f - t.value) * 14.dp.toPx()
    }
}

/** La testata della casa: Menu, il simbolo con Wisper, il cerchio con le iniziali. La campanella solo se c'è qualcosa di nuovo. */
@Composable
private fun TestataCasa() {
    val g = LocalGuscio.current
    val c = W.colori
    Box(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 12.dp).heightIn(min = 48.dp), contentAlignment = Alignment.Center) {
        if (g != null) PulsanteMenu(g.apriMenu, Modifier.align(Alignment.CenterStart).bersaglio("menu"))
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Simbolo(dimensione = 28.dp)
            Text("Wisper", style = Testi.forteGrande.copy(fontSize = 18.sp, letterSpacing = (-0.3).sp), color = c.testo)
        }
        if (g != null) Row(Modifier.align(Alignment.CenterEnd), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            if (g.notifiche > 0) Campanella(g)
            CerchioTu(g)
        }
    }
}

/** La cosa più importante: gialla, una sola, con il pulsante nero che la fa. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SchedaGialla(s: SchedaImportante, azione: String, whatsapp: Boolean, modifier: Modifier, onFai: () -> Unit) {
    val nero = Color(0xFF1A1A1A)
    Column(
        modifier.fillMaxWidth().clip(RoundedCornerShape(28.dp)).background(W.colori.giallo).padding(22.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("LA COSA PIÙ IMPORTANTE", style = Testi.etichetta.copy(letterSpacing = 0.96.sp), color = Color(0xFF4A3A00))
        Text(s.titolo, style = Testi.titoloScheda.copy(lineHeight = 26.sp), color = nero, modifier = Modifier.semantics { heading() })
        val importo = s.importo?.let(Numeri::euro)
        if (s.pillola.isNotBlank()) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(
                    s.pillola, style = Testi.secondario.copy(fontWeight = FontWeight.ExtraBold), color = Color(0xFFB42318),
                    modifier = Modifier.align(Alignment.CenterVertically).clip(RoundedCornerShape(50)).background(Color.White).padding(horizontal = 12.dp, vertical = 6.dp),
                )
                if (importo != null) Text(importo, style = Testi.forteGrande.copy(fontSize = 18.sp), color = nero, modifier = Modifier.align(Alignment.CenterVertically))
            }
        } else {
            val sotto = listOfNotNull(s.dettaglio.takeIf { it.isNotBlank() }).joinToString(" · ")
            if (sotto.isNotBlank()) Text(sotto, style = Testi.forte.copy(fontWeight = FontWeight.Bold), color = Color(0xFF3A2E00))
            if (importo != null) Text(importo, style = Testi.forteGrande.copy(fontSize = 18.sp), color = nero)
        }
        val premi = remember { MutableInteractionSource() }
        Row(
            Modifier.padding(top = 4.dp).molla(premi).fillMaxWidth().heightIn(min = 52.dp).clip(RoundedCornerShape(16.dp)).background(Color(0xFF16171B))
                .clickable(interactionSource = premi, indication = LocalIndication.current, onClick = onFai).semantics { role = Role.Button }
                .padding(horizontal = 14.dp, vertical = 6.dp),
            horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically,
        ) {
            if (whatsapp) {
                Icon(Icone.fumettoCasa, null, tint = Color.White, modifier = Modifier.size(22.dp))
                Spacer(Modifier.size(10.dp))
            }
            Text(azione, style = Testi.forteGrande, color = Color.White)
        }
    }
}

/** Il foglietto verde dopo il promemoria. */
@Composable
private fun Mandato(s: SchedaImportante) {
    val c = W.colori
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(c.firmatoFondo).padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(Modifier.size(36.dp).clip(CircleShape).background(Color(0xFF12B76A)), contentAlignment = Alignment.Center) {
            Icon(Icone.spunta, null, tint = Color(0xFF0A0A0A), modifier = Modifier.size(20.dp))
        }
        Column(Modifier.weight(1f)) {
            Text("Promemoria pronto", style = Testi.forte, color = c.firmatoTesto)
            Text(listOf(s.cliente, s.nota).filter { it.isNotBlank() }.joinToString(" · "), style = Testi.secondario, color = c.firmatoTesto)
        }
    }
}

/** Le tinte delle sei azioni: fondo della tessera (chiaro, scuro), forma, tratto (fai.md §3). */
internal object TinteAzioni {
    data class Tinta(val chiaro: Long, val scuro: Long)
    val fondi = mapOf(
        "giallo" to Tinta(0xFFFFF6DD, 0xFF3A2F14),
        "corallo" to Tinta(0xFFFFECE9, 0xFF3B2421),
        "blu" to Tinta(0xFFE6EAFF, 0xFF1F2748),
        "verde" to Tinta(0xFFE0F6EC, 0xFF14352A),
        "viola" to Tinta(0xFFEEE9FE, 0xFF2B2548),
        "acqua" to Tinta(0xFFDFF5F9, 0xFF12353F),
    )
    val Corallo = Color(0xFFFF6B57)
    val CoralloTesto = Color(0xFF1A1A1A)
}

@Composable
private fun TesseraAzione(a: AzioneCasa, prima: Boolean, numero: Int, modifier: Modifier, onClick: () -> Unit) {
    val c = W.colori
    val t = TinteAzioni.fondi.getValue(a.tinta)
    val premi = remember { MutableInteractionSource() }
    Row(
        modifier.molla(premi).fillMaxWidth().heightIn(min = if (prima) 76.dp else 68.dp).clip(RoundedCornerShape(22.dp))
            .background(Color(if (c.scuro) t.scuro else t.chiaro))
            .clickable(interactionSource = premi, indication = LocalIndication.current, onClick = onClick)
            .semantics(mergeDescendants = true) { role = Role.Button; contentDescription = a.testo + if (numero > 0) ", $numero" else "" }
            .padding(start = 12.dp, end = 16.dp, top = 6.dp, bottom = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        FormaAzione(a.chiave, if (prima) 48.dp else 44.dp)
        Text(
            a.testo, color = c.testo, modifier = Modifier.weight(1f),
            style = if (prima) Testi.forteGrande.copy(fontSize = 19.sp, lineHeight = 24.sp) else Testi.forteGrande.copy(fontSize = 18.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.2).sp, lineHeight = 23.sp),
        )
        if (numero > 0) Box(
            Modifier.widthIn(min = 28.dp).height(28.dp).clip(RoundedCornerShape(50)).background(c.testo).padding(horizontal = 9.dp),
            contentAlignment = Alignment.Center,
        ) { Text(if (numero > 99) "99+" else "$numero", style = Testi.secondario.copy(fontWeight = FontWeight.ExtraBold), color = c.foglio, maxLines = 1) }
        Icon(Icone.freccia, null, tint = c.testo, modifier = Modifier.size(22.dp))
    }
}

private val TRATTI = mapOf(
    "rapportino" to listOf("M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z", "M14 3v5h5", "M9 13h6M9 17h4"),
    "spesa" to listOf("M16 7.6A5.4 5.4 0 1 0 16 16.4", "M6 10.6h7M6 13.4h6"),
    "commessa" to listOf("M4 8h16v11H4z", "M9 8V5h6v3", "M4 13h16"),
    "cliente" to listOf("M14 8a4 4 0 1 1-8 0a4 4 0 1 1 8 0z", "M3 20c0-3.6 3.1-6 7-6s7 2.4 7 6", "M19 8v6M16 11h6"),
    "preventivo" to listOf("M8 5h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z", "M9.5 10h5M9.5 13.5h5M9.5 17h3"),
    "invia" to listOf("M21 3L10 14", "M21 3l-7 18-4-7-7-4z"),
)

/** Ogni azione ha una forma sua, come nel prototipo: fiore, cerchio, quadrato tondo, quadrifoglio, rombo, capsula. */
@Composable
private fun FormaAzione(chiave: String, dimensione: Dp) {
    val tracciati = remember(chiave) { TRATTI.getValue(chiave).map { PathParser().parsePathString(it).toPath() } }
    Canvas(Modifier.size(dimensione)) {
        scale(size.minDimension / 44f, pivot = Offset.Zero) {
            val tratto = when (chiave) {
                "rapportino" -> { fiore(); Color(0xFF1A1A1A) }
                "spesa" -> { drawCircle(TinteAzioni.Corallo, 22f, Offset(22f, 22f)); Color(0xFF1A1A1A) }
                "commessa" -> { drawRoundRect(Color(0xFF3D5AFE), Offset.Zero, Size(44f, 44f), CornerRadius(14f)); Color.White }
                "cliente" -> { quadrifoglio(); Color(0xFF0A0A0A) }
                "preventivo" -> { rotate(45f, Offset(22f, 22f)) { drawRoundRect(Color(0xFF7A5AF8), Offset(7f, 7f), Size(30f, 30f), CornerRadius(9f)) }; Color.White }
                else -> { drawRoundRect(Color(0xFF06AED4), Offset(0f, 7f), Size(44f, 30f), CornerRadius(15f)); Color(0xFF0A0A0A) }
            }
            translate(10f, 10f) {
                tracciati.forEach { drawPath(it, tratto, style = Stroke(2.2f, cap = StrokeCap.Round, join = StrokeJoin.Round)) }
            }
        }
    }
}

private fun DrawScope.fiore() {
    val g = Color(0xFFFFC53D)
    drawCircle(g, 16f, Offset(22f, 22f))
    listOf(37.5f to 22f, 32.96f to 32.96f, 22f to 37.5f, 11.04f to 32.96f, 6.5f to 22f, 11.04f to 11.04f, 22f to 6.5f, 32.96f to 11.04f)
        .forEach { (x, y) -> drawCircle(g, 6.2f, Offset(x, y)) }
}

private fun DrawScope.quadrifoglio() {
    val v = Color(0xFF12B76A)
    drawCircle(v, 12f, Offset(22f, 22f))
    listOf(22f to 11.5f, 32.5f to 22f, 22f to 32.5f, 11.5f to 22f).forEach { (x, y) -> drawCircle(v, 11.3f, Offset(x, y)) }
}

/** Una riga di Da sistemare: l'icona tinta, il titolo, il dettaglio, l'importo se c'è. Tocco lungo: Nascondi per 30 giorni. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun RigaCasa(v: VoceDashboard, onClick: () -> Unit, onLungo: (() -> Unit)?) {
    val c = W.colori
    val (fondo, tinta) = tintaRiga(Casa.tintaVoce(v))
    val apribile = v.collegamento != null || v.pezzi.isNotEmpty() || v.tipo == "approvare"
    val premi = remember { MutableInteractionSource() }
    Row(
        Modifier.molla(premi).fillMaxWidth().heightIn(min = 64.dp).clip(RoundedCornerShape(18.dp)).background(c.scheda)
            .combinedClickable(
                interactionSource = premi, indication = LocalIndication.current, enabled = apribile || onLungo != null,
                onClick = { if (apribile) onClick() }, onLongClick = onLungo, onLongClickLabel = if (onLungo != null) "Nascondi per 30 giorni" else null,
            )
            .semantics { role = Role.Button }.padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(Modifier.size(40.dp).clip(RoundedCornerShape(14.dp)).background(fondo), contentAlignment = Alignment.Center) {
            Icon(iconaVoce(v), null, tint = tinta, modifier = Modifier.size(22.dp))
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(v.titolo, style = Testi.forte.copy(lineHeight = 20.sp), color = c.testo, maxLines = 2, overflow = TextOverflow.Ellipsis)
            if (v.dettaglio.isNotBlank()) Text(v.dettaglio, style = Testi.secondario, color = c.tenue, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
        quantoVoce(v)?.let { Text(it, style = Testi.secondarioGrande.copy(fontWeight = FontWeight.ExtraBold), color = c.testo, maxLines = 1) }
        if (apribile) Icon(Icone.freccia, null, tint = c.tenue, modifier = Modifier.size(20.dp))
    }
}

@Composable
private fun RigaCalmaCasa(testo: String) {
    val c = W.colori
    Row(
        Modifier.fillMaxWidth().heightIn(min = 64.dp).clip(RoundedCornerShape(18.dp)).background(c.scheda).padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(Modifier.size(40.dp).clip(RoundedCornerShape(14.dp)).background(c.firmatoFondo), contentAlignment = Alignment.Center) {
            Icon(Icone.spunta, null, tint = c.firmatoTesto, modifier = Modifier.size(20.dp))
        }
        Text(testo, style = Testi.forte, color = c.testo)
    }
}

@Composable
private fun tintaRiga(t: String): Pair<Color, Color> {
    val s = W.colori.scuro
    fun f(chiaro: Long, scuro: Long) = Color(if (s) scuro else chiaro)
    return when (t) {
        "ambra" -> f(0xFFFFF1D6, 0xFF3A2F14) to f(0xFF8A5A00, 0xFFFFD76A)
        "corallo" -> f(0xFFFFECE9, 0xFF3B2421) to f(0xFFA3321F, 0xFFFFB4A8)
        "blu" -> f(0xFFE6EAFF, 0xFF1F2748) to f(0xFF2F48D9, 0xFF9DB0FF)
        "viola" -> f(0xFFEEE9FE, 0xFF2B2548) to f(0xFF5B3FD9, 0xFFC4B5FD)
        "verde" -> f(0xFFE0F6EC, 0xFF14352A) to f(0xFF0B5F37, 0xFF7FE3B4)
        "acqua" -> f(0xFFDFF5F9, 0xFF12353F) to f(0xFF0E7090, 0xFF7EDADC)
        else -> f(0xFFECEEF2, 0xFF2A2D33) to f(0xFF44474F, 0xFFD3D5DB)
    }
}

/**
 * Il foglio del promemoria (fai.md §5): il messaggio già pronto nella bolla, Manda su WhatsApp e Cambia il testo. Se per
 * quella fattura non c'è un messaggio pronto (nessun numero, cliente che non si sollecita) si apre il Messaggio di sempre.
 */
@Composable
private fun FoglioPromemoria(dati: Dati, s: SchedaImportante, onChiudi: () -> Unit) {
    val c = W.colori
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    val lettura = rememberLettura("promemoria-${s.idFattura}", Giri7.comunicazioni) { dati.fase7.daMandare() }
    val pronta = (lettura as? Lettura.Pronta)?.dato?.tutte?.firstOrNull { it.proposta.startsWith("fattura:${s.idFattura}:") }
        ?.takeIf { it.testo.isNotBlank() && (it.canale != "whatsapp" || it.a.conNumero) }
    val letta = lettura is Lettura.Pronta || lettura is Lettura.Errore

    /** Apre il Messaggio e, quando si chiude dopo aver preparato qualcosa, la scheda gialla passa alla cosa dopo. */
    fun apri(b: Bozza7) {
        RicordoPromemoria.scheda = s
        RicordoPromemoria.giroPrima = Giri7.comunicazioni
        MessaggioDaAprire.bozza = b
        onChiudi()
    }
    LaunchedEffect(letta, pronta) {
        if (letta && pronta == null) {
            val idCliente = ana.clienti.firstOrNull { it.nome == s.cliente }?.id.orEmpty()
            onChiudi()
            RicordoPromemoria.scheda = s
            RicordoPromemoria.giroPrima = Giri7.comunicazioni
            apriMessaggio(dati, idCliente, "promemoria_pagamento", Riferimento7("fattura", s.idFattura.orEmpty(), s.nota))
        }
    }
    if (pronta == null) return
    val whatsapp = pronta.canale == "whatsapp"
    FoglioDalBasso(onChiudi) {
        Column {
            Text("Promemoria a ${s.cliente.ifBlank { pronta.a.cliente.ifBlank { "il cliente" } }}", style = Testi.titoloScheda, color = c.testo)
            Spacer(Modifier.height(4.dp))
            Text(
                (if (whatsapp) "Su WhatsApp" else "Per email") + pronta.a.nome.takeIf { it.isNotBlank() }?.let { if (whatsapp) ", a $it" else " a $it" }.orEmpty(),
                style = Testi.secondarioGrande, color = c.tenue,
            )
        }
        Text(
            pronta.testo, style = Testi.testo.copy(lineHeight = 23.sp), color = c.testo,
            modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(topStart = 22.dp, topEnd = 22.dp, bottomEnd = 22.dp, bottomStart = 6.dp))
                .background(c.firmatoFondo).padding(horizontal = 16.dp, vertical = 14.dp),
        )
        val premi = remember { MutableInteractionSource() }
        Row(
            Modifier.molla(premi).fillMaxWidth().heightIn(min = 56.dp).clip(RoundedCornerShape(18.dp)).background(Color(0xFF12B76A))
                .clickable(interactionSource = premi, indication = LocalIndication.current) { apri(Bozza7.daProposta(pronta).copy(subito = true)) }
                .semantics { role = Role.Button },
            horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(if (whatsapp) Icone.fumettoCasa else Icone.email, null, tint = Color(0xFF0A0A0A), modifier = Modifier.size(22.dp))
            Spacer(Modifier.size(10.dp))
            Text(if (whatsapp) "Manda su WhatsApp" else "Manda per email", style = Testi.forteGrande, color = Color(0xFF0A0A0A))
        }
        PulsanteBordo("Cambia il testo", { apri(Bozza7.daProposta(pronta)) }, Modifier.fillMaxWidth())
    }
}

/** La fattura del promemoria aperto: se il Messaggio si chiude avendo preparato qualcosa, la casa va avanti. */
internal object RicordoPromemoria {
    var scheda: SchedaImportante? = null
    var giroPrima = 0

    fun chiuso() {
        val s = scheda ?: return
        scheda = null
        if (Giri7.comunicazioni > giroPrima) {
            s.idFattura?.let { RicordoCasa.mandati.add(it) }
            RicordoCasa.ultimoMandato = s
        }
    }
}
