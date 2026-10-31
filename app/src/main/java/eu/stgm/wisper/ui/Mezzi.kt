@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package eu.stgm.wisper.ui

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import eu.stgm.wisper.Dati
import eu.stgm.wisper.rapportino.Attrezzatura
import eu.stgm.wisper.rapportino.ColoreFase5
import eu.stgm.wisper.rapportino.ContiMezzi
import eu.stgm.wisper.rapportino.ControlloKm
import eu.stgm.wisper.rapportino.Immagini
import eu.stgm.wisper.rapportino.InCoda6
import eu.stgm.wisper.rapportino.Mezzo
import eu.stgm.wisper.rapportino.Moduli
import eu.stgm.wisper.rapportino.Numeri
import eu.stgm.wisper.rapportino.PonteServer
import eu.stgm.wisper.rapportino.TestiCoda
import eu.stgm.wisper.rapportino.dataDi
import eu.stgm.wisper.rapportino.dataIt
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.io.File
import java.time.LocalDate

/*
 * 13 Mezzi e attrezzature sul telefono (fase6.md §12.3): Il mio · Mezzi · Strumenti ·
 * Altro · Scadenze. Davanti le cose da un minuto (il mio mezzo, i km, un guasto, i miei
 * strumenti con la taratura), anche senza rete; il resto un livello sotto (Altro).
 */

enum class SegmentoMezzi(val nome: String) { MIO("Il mio"), MEZZI("Mezzi"), STRUMENTI("Strumenti"), ALTRO("Altro"), SCADENZE("Scadenze") }

enum class FiltroStrumenti(val nome: String) { TUTTI("Tutti"), MIEI("Miei"), SCADUTA("Taratura scaduta"), DISPONIBILI("Disponibili") }

object RicordoMezzi {
    var segmento by mutableStateOf(SegmentoMezzi.MIO)
    var filtro by mutableStateOf(FiltroStrumenti.TUTTI)

    /** Dalla Dashboard: {segmento: miei | mezzi | strumenti | attrezzature | scadenze | dpi, taratura}. */
    fun mostra(segmento: String, taratura: String = "") {
        this.segmento = when (segmento) {
            "mezzi" -> SegmentoMezzi.MEZZI
            "strumenti" -> SegmentoMezzi.STRUMENTI
            "attrezzature", "dpi" -> SegmentoMezzi.ALTRO
            "scadenze" -> SegmentoMezzi.SCADENZE
            else -> SegmentoMezzi.MIO
        }
        filtro = if (taratura == "scadute") FiltroStrumenti.SCADUTA else FiltroStrumenti.TUTTI
    }
}

/** Il preavviso delle tarature (impostazione TARATURA_PREAVVISO_GIORNI, di base 30). */
@Composable
private fun preavvisoTarature(dati: Dati): Int {
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    return ana.impostazione("TARATURA_PREAVVISO_GIORNI").toIntOrNull() ?: 30
}

/** Gli strumenti col loro stato di OGGI (il telefono lo rifà dalla data anche senza rete, §3.13) e la coda sopra. */
@Composable
internal fun strumentiConCoda(dati: Dati, lette: List<Attrezzatura>): List<Attrezzatura> {
    val ops by dati.operazioni.collectAsStateWithLifecycle()
    val sessione by dati.sessione.collectAsStateWithLifecycle()
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    val preavviso = preavvisoTarature(dati)
    return remember(lette, ops, ana) {
        val oggi = LocalDate.now()
        val conStato = lette.map { a ->
            val mio = ana.mieiStrumenti.firstOrNull { it.id == a.id }
            if (mio != null) a.copy(taratura = mio.statoOggi(oggi, preavviso)) else a
        }
        InCoda6.applicaAttrezzature(conStato, ops, sessione.idPersona, sessione.utente.nome)
    }
}

@Composable
fun SchermataMezzi(dati: Dati, nav: Navigatore) {
    val c = W.colori
    val perm = LocalPermessi.current
    val sessione by dati.sessione.collectAsStateWithLifecycle()
    val scrive = perm.modifica(Moduli.MEZZI)
    val seg = RicordoMezzi.segmento
    var prendi by remember { mutableStateOf(false) }
    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).padding(top = 10.dp, bottom = 130.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            TestataInterna({ nav.indietro() })
            TitoloPagina("Mezzi e attrezzature")
            SegmentiScorrevoli(SegmentoMezzi.entries.map { it to it.nome }, seg, { RicordoMezzi.segmento = it })
            when (seg) {
                SegmentoMezzi.MIO -> PaginaIlMio(dati, nav)
                SegmentoMezzi.MEZZI -> PaginaElencoMezzi(dati, nav)
                SegmentoMezzi.STRUMENTI -> PaginaStrumenti(dati, nav)
                SegmentoMezzi.ALTRO -> PaginaAltroMezzi(nav)
                SegmentoMezzi.SCADENZE -> PaginaScadenzeMezzi(dati, nav)
            }
        }
        val giallo: Pair<String, () -> Unit>? = when (seg) {
            SegmentoMezzi.MIO -> if (sessione.idPersona.isNotBlank()) "Prendi uno strumento" to { prendi = true } else null
            SegmentoMezzi.MEZZI -> if (scrive) "Aggiungi un mezzo" to { nav.vai("mezzo-nuovo") } else null
            SegmentoMezzi.STRUMENTI -> if (scrive) "Aggiungi uno strumento" to { nav.vai("strumento-nuovo") } else null
            SegmentoMezzi.SCADENZE -> if (scrive && perm.vede(Moduli.DOCUMENTI)) "Nuova scadenza" to { nav.vai("scadenza-nuova") } else null
            else -> null
        }
        giallo?.let { (t, fai) -> FondoConPulsante(Modifier.align(Alignment.BottomCenter)) { PulsantePrincipale(t, fai, icona = if (seg == SegmentoMezzi.MIO) Icone.misura else Icone.piu) } }
    }
    if (prendi) FoglioPrendi(dati) { prendi = false }
}

// ---------------------------------------------------------------------------------- il mio

@Composable
private fun PaginaIlMio(dati: Dati, nav: Navigatore) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val ops by dati.operazioni.collectAsStateWithLifecycle()
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    var giro by remember { mutableIntStateOf(0) }
    val giri = giro + Giri6.mezzi * 1000 + ops.count { it.fase6 } * 7
    val mezzi = rememberLettura("mezzi", giri) { dati.fase6.mezzi() }
    val attr = rememberLettura("attrezzature", giri) { dati.fase6.attrezzature() }
    var km by remember { mutableStateOf<Mezzo?>(null) }
    var restituisci by remember { mutableStateOf<Attrezzatura?>(null) }

    AvvisoRifiuto(dati)
    TestiCoda.pezziFase6(ops.filter { it.fase6 && !it.rifiutata }).takeIf { it.isNotEmpty() }?.let { p ->
        PillolaRete(p.joinToString(", ") { it.second }.replace(Regex(", ([^,]+)$"), " e $1") + if (p.sumOf { it.first } > 1) " partono appena c'è rete" else " parte appena c'è rete")
    }
    // Il mio mezzo: dalla lettura, o (senza rete) dalle anagrafiche.
    val mioBreve = ana.mezzi.firstOrNull { it.mio }
    val mioDaElenco = (mezzi as? Lettura.Pronta)?.dato?.firstOrNull { it.mio }
    val idMio = mioDaElenco?.id ?: mioBreve?.id
    if (idMio != null) {
        val scheda = rememberLettura("mezzo-mio-$idMio", giri) { dati.fase6.mezzo(idMio, mio = true) }
        val m = ((scheda as? Lettura.Pronta)?.dato ?: mioDaElenco)?.let { InCoda6.applicaMezzo(it, ops) }
        Sezione5("Il mezzo che usi") {
            Scheda(orizzontale = 18.dp, verticale = 16.dp, spazio = 12.dp) {
                if (m == null) Text(mioBreve?.titolo.orEmpty(), style = Testi.titoloSezione, color = c.testo)
                else {
                    RigaVoce(m.titolo, sotto = m.km?.let { ContiMezzi.km(it) + " km · letti il " + breve(m.kmIl) } ?: "Km non ancora segnati",
                        icona = Icone.mezzo, onClick = { nav.vai("mezzo/${m.id}") })
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        if (m.stato == "fermo") Parola6("Fermo: " + m.motivoFermo.ifBlank { "non si usa" }, colore = ColoreFase5.ROSSO)
                        m.scadenze.filter { (it.giorni ?: 999) <= 30 && it.stato == "aperta" }.forEach { s -> Parola6(scadenzaMezzoParola(s.tipo) + ": " + s.statoVisto.lowercase(), colore = ColoreFase6.di(s.statoVisto)) }
                        m.manutenzioni.filter { it.aperta }.forEach { g -> Parola6("Guasto: " + g.titolo.lowercase(), colore = ColoreFase5.GRIGIO) }
                    }
                    if (m.lettoAl.isNotBlank()) RigaInfo(lettoAlle(m.lettoAl))
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        PulsanteBordo("Segna i km", { km = m }, icona = Icone.misura, altezza = 48.dp)
                        PulsanteBordo("Segnala un guasto", { nav.vai("guasto-nuovo/mezzo/${m.id}") }, icona = Icone.allarme, altezza = 48.dp)
                    }
                }
            }
        }
    }
    // I miei strumenti: dal catalogo letto, o (senza rete) dalle anagrafiche.
    val lette = (attr as? Lettura.Pronta)?.dato
    val tutte = strumentiConCoda(dati, lette ?: ana.mieiStrumenti.map { s ->
        Attrezzatura(s.id, s.codice, s.nome, s.categoria, matricola = s.matricola, controllo = s.controllo, taratura = s.taratura, mio = true, fuoriUso = s.fuoriUso)
    })
    val miei = tutte.filter { it.mio }
    val strumenti = miei.filter { it.categoria == "strumento" }
    val altre = miei.filter { it.categoria != "strumento" }
    if (attr is Lettura.InCorso && lette == null && ana.mieiStrumenti.isEmpty()) Segnaposto(140.dp)
    if (strumenti.isNotEmpty()) Sezione5("I tuoi strumenti") {
        SchedaElenco {
            strumenti.forEachIndexed { i, a ->
                if (i > 0) LineaElenco()
                RigaAttrezzatura(a, modifier = if (i == 0) Modifier.bersaglio("strumento-scaduto") else Modifier) { restituisci = a }
            }
        }
    }
    if (altre.isNotEmpty()) Sezione5("Attrezzature e DPI") {
        SchedaElenco { altre.forEachIndexed { i, a -> if (i > 0) LineaElenco(); RigaAttrezzatura(a) { restituisci = a } } }
    }
    if (idMio == null && miei.isEmpty() && (attr !is Lettura.InCorso)) Scheda(orizzontale = 18.dp, verticale = 16.dp) { RigaCalma("Non hai mezzi né strumenti assegnati.") }
    if (attr is Lettura.Errore && lette == null && ana.mieiStrumenti.isEmpty()) SchedaErrore(attr.messaggio) { giro++ }

    km?.let { m -> FoglioKm(dati, m) { km = null } }
    restituisci?.let { a ->
        FoglioDalBasso({ restituisci = null }) {
            Text(a.nome, style = Testi.titoloScheda, color = c.testo)
            Text(listOf(a.codice, if (a.matricola.isNotBlank()) "matr. ${a.matricola}" else "").filter { it.isNotBlank() }.joinToString(" · "), style = Testi.secondario, color = c.tenue)
            a.taratura?.let { Parola6(it.parola, colore = it.colore) }
            VoceMenu(Icone.freccia, "Apri la scheda", { restituisci = null; nav.vai("strumento/${a.id}") })
            VoceMenu(Icone.allarme, "Segnala un guasto", { restituisci = null; nav.vai("guasto-nuovo/strumento/${a.id}") })
            if (a.chi?.tipo == "prestito") VoceMenu(Icone.riapri, "Restituisci", {
                restituisci = null
                if (!dati.esempio) dati.fase6.restituisci(a.id, null)
                avvisi.mostra(if (dati.esempio) SOLO_ESEMPIO else "Restituito: parte appena c'è rete")
            })
        }
    }
}

/** Segna i km (foglio, §12.3): i km grandi, l'ultima lettura, la foto del contachilometri; parte anche senza rete. */
@Composable
internal fun FoglioKm(dati: Dati, m: Mezzo, onChiudi: () -> Unit) {
    val c = W.colori
    val ctx = LocalContext.current
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    var testo by remember { mutableStateOf(m.km?.toString().orEmpty()) }
    var errore by remember { mutableStateOf<String?>(null) }
    var conferma by remember { mutableStateOf<String?>(null) }
    var foto by remember { mutableStateOf<File?>(null) }
    var scatto by rememberSaveable { mutableStateOf<String?>(null) }
    val fotocamera = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok ->
        val p = scatto ?: return@rememberLauncherForActivityResult
        scatto = null
        val f = File(p)
        if (!ok) { f.delete(); return@rememberLauncherForActivityResult }
        scope.launch { runCatching { dati.preparaFoto(Uri.fromFile(f)) }.onSuccess { foto = it }.onFailure { avvisi.mostra("La foto non si legge: riprova") }; f.delete() }
    }
    fun salva(confermato: Boolean) {
        val k = testo.filter { it.isDigit() }.toLongOrNull()
        val oggi = LocalDate.now()
        when (val e = ControlloKm.controlla(k, oggi, m.km, dataDi(m.kmIl))) {
            is ControlloKm.Esito.No -> { errore = e.messaggio; return }
            is ControlloKm.Esito.Conferma -> if (!confermato) { conferma = e.messaggio; return }
            else -> {}
        }
        if (dati.esempio) { avvisi.mostra(SOLO_ESEMPIO); onChiudi(); return }
        dati.fase6.segnaKm(m.id, k!!, oggi, foto, confermato)
        avvisi.mostra("Km salvati: " + ContiMezzi.km(k) + (if (foto != null) " con la foto" else ""))
        onChiudi()
    }
    FoglioDalBasso(onChiudi) {
        Text("Segna i km", style = Testi.titoloScheda, color = c.testo)
        Text(m.titolo + (m.km?.let { " · ultima lettura " + ContiMezzi.km(it) + " il " + breve(m.kmIl) } ?: ""), style = Testi.secondarioGrande, color = c.tenue)
        BasicTextField(
            value = testo, onValueChange = { t -> testo = t.filter { it.isDigit() }.take(7); errore = null; conferma = null }, singleLine = true,
            textStyle = Testi.totale.copy(color = c.testo), cursorBrush = SolidColor(c.testo), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            decorationBox = { campo ->
                Row(
                    Modifier.fillMaxWidth().heightIn(min = 68.dp).clip(RoundedCornerShape(16.dp)).background(c.scheda)
                        .border(1.5.dp, if (errore != null) c.rossoPieno else c.bordoCampo, RoundedCornerShape(16.dp)).padding(horizontal = 16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) { Box(Modifier.weight(1f)) { campo() }; Text("km", style = Testi.titoloScheda, color = c.tenue) }
            },
        )
        errore?.let { Text(it, style = Testi.secondario, color = c.rossoTesto) }
        conferma?.let { Text(it, style = Testi.forte, color = c.gialloTesto) }
        if (foto == null) PulsanteBordo("Fotografa il contachilometri", {
            if (dati.esempio) { avvisi.mostra(SOLO_ESEMPIO); return@PulsanteBordo }
            val f = Immagini.fileScatto(ctx); scatto = f.path
            fotocamera.launch(FileProvider.getUriForFile(ctx, ctx.packageName + ".foto", f))
        }, Modifier.fillMaxWidth(), icona = Icone.fotocamera, altezza = 60.dp, tratteggiato = true)
        else Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            MiniaturaFoto(foto, "Foto del contachilometri") {}
            PulsanteTesto("Togli la foto", { foto?.delete(); foto = null })
        }
        PulsantePrincipale(if (conferma != null) "Sì, salva i km" else "Salva i km", { salva(conferma != null) }, icona = Icone.spunta)
    }
}

/** Prendi uno strumento (foglio): gli strumenti disponibili; il tocco è Lo prendo io (anche senza rete). */
@Composable
private fun FoglioPrendi(dati: Dati, onChiudi: () -> Unit) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val l = rememberLettura("attrezzature-prendi", 0) { dati.fase6.attrezzature() }
    val tutte = strumentiConCoda(dati, (l as? Lettura.Pronta)?.dato ?: dati.fase6.attrezzatureLette())
    val disponibili = tutte.filter { it.disponibile && !it.mio && it.taratura?.spento != true }
    FoglioDalBasso(onChiudi) {
        Text("Prendi uno strumento", style = Testi.titoloScheda, color = c.testo)
        Column(Modifier.heightIn(max = 460.dp).verticalScroll(rememberScrollState())) {
            SchedaElenco {
                if (disponibili.isEmpty()) RigaCalma(if (l is Lettura.InCorso) "Leggo…" else "Niente di disponibile adesso.")
                disponibili.forEachIndexed { i, a ->
                    if (i > 0) LineaElenco()
                    RigaAttrezzatura(a) {
                        if (dati.esempio) { avvisi.mostra(SOLO_ESEMPIO); onChiudi(); return@RigaAttrezzatura }
                        dati.fase6.prendi(a.id, null)
                        avvisi.mostra("Preso: " + a.nome + " è in prestito a te fino a stasera")
                        onChiudi()
                    }
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------------- elenchi

@Composable
private fun PaginaElencoMezzi(dati: Dati, nav: Navigatore) {
    var giro by remember { mutableIntStateOf(0) }
    val l = rememberLettura("mezzi-elenco", giro + Giri6.mezzi * 1000) { dati.fase6.mezzi() }
    when (l) {
        is Lettura.InCorso -> Segnaposto(160.dp)
        is Lettura.Errore -> SchedaErrore(l.messaggio) { giro++ }
        is Lettura.Pronta -> {
            l.dato.firstOrNull()?.lettoAl?.takeIf { it.isNotBlank() }?.let { RigaInfo(lettoAlle(it)) }
            SchedaElenco {
                if (l.dato.isEmpty()) RigaCalma("Nessun mezzo.")
                l.dato.forEachIndexed { i, m -> if (i > 0) LineaElenco(); RigaMezzo(m) { nav.vai("mezzo/${m.id}") } }
            }
        }
    }
}

@Composable
private fun PaginaStrumenti(dati: Dati, nav: Navigatore) {
    var giro by remember { mutableIntStateOf(0) }
    val l = rememberLettura("attrezzature", giro + Giri6.mezzi * 1000) { dati.fase6.attrezzature() }
    PilloleFiltro(FiltroStrumenti.entries.map { it to it.nome }, RicordoMezzi.filtro, { RicordoMezzi.filtro = it })
    when (l) {
        is Lettura.InCorso -> Segnaposto(200.dp)
        is Lettura.Errore -> SchedaErrore(l.messaggio) { giro++ }
        is Lettura.Pronta -> {
            val tutte = strumentiConCoda(dati, l.dato).filter { it.categoria == "strumento" }
            val lista = when (RicordoMezzi.filtro) {
                FiltroStrumenti.TUTTI -> tutte
                FiltroStrumenti.MIEI -> tutte.filter { it.mio }
                FiltroStrumenti.SCADUTA -> tutte.filter { it.taratura?.stato == ContiMezzi.SCADUTA || it.taratura?.stato == ContiMezzi.NON_CONFORME }
                FiltroStrumenti.DISPONIBILI -> tutte.filter { it.disponibile }
            }
            SchedaElenco {
                if (lista.isEmpty()) RigaCalma("Niente con questo filtro.")
                lista.forEachIndexed { i, a -> if (i > 0) LineaElenco(); RigaAttrezzatura(a) { nav.vai("strumento/${a.id}") } }
            }
        }
    }
}

@Composable
private fun PaginaAltroMezzi(nav: Navigatore) {
    SchedaElenco {
        RigaVoce("Attrezzature", sotto = "Attrezzi e informatica", icona = Icone.attrezzo, onClick = { nav.vai("mezzi-altro/attrezzature") })
        LineaElenco()
        RigaVoce("DPI", sotto = "Consegne e DPI con verifica", icona = Icone.scudo, onClick = { nav.vai("mezzi-altro/dpi") })
        LineaElenco()
        RigaVoce("Assegnazioni e prestiti", sotto = "Chi ha cosa, da quando", icona = Icone.collab, onClick = { nav.vai("mezzi-altro/assegnazioni") })
        LineaElenco()
        RigaVoce("Guasti e manutenzioni", sotto = "Aperti e chiusi, con le foto", icona = Icone.allarme, onClick = { nav.vai("mezzi-altro/guasti") })
    }
}

@Composable
private fun PaginaScadenzeMezzi(dati: Dati, nav: Navigatore) {
    var giro by remember { mutableIntStateOf(0) }
    val l = rememberLettura("scadenze-mezzi", giro + Giri6.mezzi * 1000) { dati.fase5.scadenzeDi(listOf("gruppo" to "mezzi")) }
    when (l) {
        is Lettura.InCorso -> Segnaposto(160.dp)
        is Lettura.Errore -> SchedaErrore(l.messaggio) { giro++ }
        is Lettura.Pronta -> {
            val e = l.dato
            if (e.scadute.isEmpty() && e.entro.isEmpty() && e.piuAvanti.isEmpty()) Scheda(orizzontale = 18.dp, verticale = 16.dp) { RigaCalma("Nessuna scadenza di mezzi e strumenti.") }
            listOf("Scadute" to e.scadute, "Nel preavviso" to e.entro, "Più avanti" to e.piuAvanti).forEach { (nome, lista) ->
                if (lista.isNotEmpty()) Sezione5(nome, lista.size) {
                    SchedaElenco {
                        lista.forEachIndexed { i, s ->
                            if (i > 0) LineaElenco()
                            RigaScadenza(s) {
                                when {
                                    s.idVeicolo.isNotBlank() -> nav.vai("mezzo/${s.idVeicolo}")
                                    s.idAttrezzatura.isNotBlank() -> nav.vai("strumento/${s.idAttrezzatura}")
                                    else -> nav.vai("scadenza/${s.id}")
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

/** Le pagine di "Altro" (un livello sotto): attrezzature, DPI, assegnazioni, guasti. Nessun giallo tranne Consegna un DPI. */
@Composable
fun SchermataAltroMezzi(dati: Dati, nav: Navigatore, cosa: String) {
    val c = W.colori
    var giro by remember { mutableIntStateOf(0) }
    Column(
        Modifier.fillMaxSize().background(c.fondo).verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = 60.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Testata(onIndietro = { nav.indietro() })
        when (cosa) {
            "attrezzature" -> {
                TitoloPagina("Attrezzature")
                val l = rememberLettura("attrezzature", giro) { dati.fase6.attrezzature() }
                when (l) {
                    is Lettura.Pronta -> SchedaElenco {
                        val a = strumentiConCoda(dati, l.dato).filter { it.categoria == "attrezzo" || it.categoria == "informatica" || it.categoria == "altro" }
                        if (a.isEmpty()) RigaCalma("Nessuna attrezzatura.")
                        a.forEachIndexed { i, x -> if (i > 0) LineaElenco(); RigaAttrezzatura(x) { nav.vai("strumento/${x.id}") } }
                    }
                    is Lettura.Errore -> SchedaErrore(l.messaggio) { giro++ }
                    else -> Segnaposto(160.dp)
                }
            }
            "dpi" -> {
                TitoloPagina("DPI")
                val d = rememberLettura("dpi", giro) { dati.fase6.dpi() }
                Sezione5("Consegne") {
                    when (d) {
                        is Lettura.Pronta -> SchedaElenco {
                            if (d.dato.isEmpty()) RigaCalma("Nessuna consegna.")
                            d.dato.forEachIndexed { i, k ->
                                if (i > 0) LineaElenco()
                                RigaVoce(k.cosa + if (k.taglia.isNotBlank()) " · taglia ${k.taglia}" else "", sotto = k.persona + " · consegnato il " + dataIt(k.data),
                                    inizio = { CerchioPersona(eu.stgm.wisper.rapportino.Utente("", k.persona).iniziali, 36.dp) },
                                    fine = { Parola6(if (k.firmata) "Firmata" else "Da firmare") }, onClick = { nav.vai("persona/${k.idPersona}") })
                            }
                        }
                        is Lettura.Errore -> SchedaErrore(d.messaggio) { giro++ }
                        else -> Segnaposto(120.dp)
                    }
                }
                val l = rememberLettura("attrezzature", giro) { dati.fase6.attrezzature() }
                Sezione5("DPI con verifica") {
                    when (l) {
                        is Lettura.Pronta -> SchedaElenco {
                            val a = l.dato.filter { it.categoria == "dpi" }
                            if (a.isEmpty()) RigaCalma("Nessun DPI con verifica.")
                            a.forEachIndexed { i, x -> if (i > 0) LineaElenco(); RigaAttrezzatura(x) { nav.vai("strumento/${x.id}") } }
                        }
                        is Lettura.Errore -> SchedaErrore(l.messaggio) { giro++ }
                        else -> Segnaposto(90.dp)
                    }
                }
            }
            "assegnazioni" -> {
                TitoloPagina("Assegnazioni e prestiti")
                val l = rememberLettura("assegnazioni", giro) { dati.fase6.assegnazioni() }
                when (l) {
                    is Lettura.Pronta -> {
                        val (inCorso, storico) = l.dato.partition { it.inCorso }
                        Sezione5("In corso", inCorso.size) {
                            SchedaElenco {
                                if (inCorso.isEmpty()) RigaCalma("Niente in corso.")
                                inCorso.forEachIndexed { i, a ->
                                    if (i > 0) LineaElenco()
                                    RigaVoce(a.oggetto, sotto = a.tipoVisto + " · " + a.chi + " · dal " + breve(a.dal) + if (a.rientro.isNotBlank()) " · rientro " + breve(a.rientro) else "",
                                        icona = if (a.idVeicolo.isNotBlank()) Icone.mezzo else Icone.attrezzo,
                                        fine = { if (a.inRitardo) Parola6("Oltre il rientro") },
                                        onClick = { if (a.idVeicolo.isNotBlank()) nav.vai("mezzo/${a.idVeicolo}") else nav.vai("strumento/${a.idAttrezzatura}") })
                                }
                            }
                        }
                        if (storico.isNotEmpty()) Sezione5("Storico") {
                            SchedaElenco { storico.take(30).forEachIndexed { i, a -> if (i > 0) LineaElenco(); RigaVoce(a.oggetto, sotto = a.tipoVisto + " · " + a.chi + " · dal " + breve(a.dal) + " al " + breve(a.al), icona = Icone.storia) } }
                        }
                    }
                    is Lettura.Errore -> SchedaErrore(l.messaggio) { giro++ }
                    else -> Segnaposto(160.dp)
                }
            }
            else -> {
                TitoloPagina("Guasti e manutenzioni")
                val l = rememberLettura("manutenzioni", giro) { dati.fase6.manutenzioni() }
                when (l) {
                    is Lettura.Pronta -> SchedaElenco {
                        if (l.dato.isEmpty()) RigaCalma("Nessun guasto.")
                        l.dato.forEachIndexed { i, g ->
                            if (i > 0) LineaElenco()
                            RigaVoce(g.titolo, sotto = listOf(g.oggetto, dataIt(g.data), g.segnalataDaNome).filter { it.isNotBlank() }.joinToString(" · "),
                                inizio = { IconaColorata(if (g.aperta) Icone.allarme else Icone.spunta, if (g.aperta) ColoreFase5.AMBRA else ColoreFase5.VERDE) },
                                fine = { Parola6(g.statoVisto) },
                                onClick = { if (g.idVeicolo.isNotBlank()) nav.vai("mezzo/${g.idVeicolo}") else if (g.idAttrezzatura.isNotBlank()) nav.vai("strumento/${g.idAttrezzatura}") })
                        }
                    }
                    is Lettura.Errore -> SchedaErrore(l.messaggio) { giro++ }
                    else -> Segnaposto(160.dp)
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------------- il mezzo

@Composable
fun SchermataMezzo(dati: Dati, nav: Navigatore, id: String) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val perm = LocalPermessi.current
    val ops by dati.operazioni.collectAsStateWithLifecycle()
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    var giro by remember { mutableIntStateOf(0) }
    val mio = ana.mezzi.any { it.id == id && it.mio }
    val l = rememberLettura("mezzo-$id", giro + Giri6.mezzi * 1000 + ops.count { it.fase6 } * 7) { dati.fase6.mezzo(id, mio) }
    var km by remember { mutableStateOf<Mezzo?>(null) }
    var chiudi by remember { mutableStateOf<eu.stgm.wisper.rapportino.Manutenzione?>(null) }
    val scrive = perm.modifica(Moduli.MEZZI)
    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).padding(top = 10.dp, bottom = 130.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            TestataInterna({ nav.indietro() })
            when (l) {
                is Lettura.InCorso -> { Segnaposto(90.dp); Segnaposto(200.dp) }
                is Lettura.Errore -> SchedaErrore(l.messaggio) { giro++ }
                is Lettura.Pronta -> {
                    val m = InCoda6.applicaMezzo(l.dato, ops)
                    if (m.lettoAl.isNotBlank()) RigaInfo(lettoAlle(m.lettoAl))
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Parola6(if (m.stato == "fermo") "Fermo" else m.statoVisto, colore = m.coloreStato)
                        Parola6(if (m.delloStudio) "Dello studio" else "Auto di una persona", colore = ColoreFase5.GRIGIO)
                    }
                    TitoloPagina(m.titolo)
                    Text(listOf(m.tipo.replaceFirstChar { it.uppercase() }, m.alimentazione, if (m.immatricolazione.isNotBlank()) "immatricolato il " + dataIt(m.immatricolazione) else "").filter { it.isNotBlank() }.joinToString(" · "),
                        style = Testi.secondarioGrande, color = c.tenue)
                    if (m.stato == "fermo" && m.motivoFermo.isNotBlank()) Fascia6("Non si usa: " + m.motivoFermo, rossa = true)
                    if (!m.delloStudio) {
                        Scheda(orizzontale = 18.dp, verticale = 12.dp, spazio = 2.dp) {
                            Coppia("Di chi è", m.chi?.nome ?: m.proprietaVista)
                            m.euroKm?.let { Coppia("Rimborso km", Numeri.scrivi(it) + " € al km") }
                        }
                    } else {
                        if (m.mio || m.puoSegnareKm || scrive) FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            PulsanteBordo("Segnala un guasto", { nav.vai("guasto-nuovo/mezzo/${m.id}") }, icona = Icone.allarme, altezza = 48.dp)
                            if (!m.mio) PulsanteBordo("Segna i km", { km = m }, icona = Icone.misura, altezza = 48.dp)
                        }
                        Sezione5("Chi ce l'ha") {
                            Scheda(orizzontale = 18.dp, verticale = 12.dp, spazio = 2.dp) {
                                Coppia("Adesso", m.chi?.nome ?: m.statoVisto)
                                m.chi?.dal?.takeIf { it.isNotBlank() }?.let { Coppia("Da", dataIt(it)) }
                                m.chi?.rientro?.takeIf { it.isNotBlank() }?.let { Coppia("Rientro", dataIt(it)) }
                            }
                        }
                        if (m.scadenze.isNotEmpty()) Sezione5("Scadenze") {
                            SchedaElenco { m.scadenze.forEachIndexed { i, s -> if (i > 0) LineaElenco(); RigaScadenza(s, null) } }
                        }
                        Sezione5("Km") {
                            Scheda(orizzontale = 18.dp, verticale = 14.dp, spazio = 6.dp) {
                                Text(m.km?.let { ContiMezzi.km(it) + " km" } ?: "Km non segnati", style = Testi.numeroGrande, color = c.testo)
                                val sotto = listOfNotNull(if (m.kmIl.isNotBlank()) "Letti il " + dataIt(m.kmIl) else null,
                                    m.kmAlTagliando?.let { if (it >= 0) "tagliando fra " + ContiMezzi.km(it) + " km" else "tagliando passato di " + ContiMezzi.km(-it) + " km" })
                                if (sotto.isNotEmpty()) Text(sotto.joinToString(" · "), style = Testi.secondario, color = c.tenue)
                                m.letture.take(5).forEach { r ->
                                    Row(Modifier.fillMaxWidth()) {
                                        Text(dataIt(r.data) + listOf(r.utente, if (r.conFoto) "con la foto" else "").filter { it.isNotBlank() }.joinToString(" · ", prefix = " · ").removeSuffix(" · "),
                                            style = Testi.secondario, color = c.testo2, modifier = Modifier.weight(1f))
                                        Text(ContiMezzi.km(r.km), style = Testi.secondario.copy(fontWeight = FontWeight.Bold), color = c.testo)
                                    }
                                }
                            }
                        }
                        Sezione5("Guasti e manutenzioni") {
                            SchedaElenco {
                                if (m.manutenzioni.isEmpty()) RigaCalma("Nessun guasto.")
                                m.manutenzioni.forEachIndexed { i, g ->
                                    if (i > 0) LineaElenco()
                                    Column(Modifier.fillMaxWidth().padding(vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                            IconaColorata(if (g.aperta) Icone.allarme else Icone.spunta, if (g.aperta) ColoreFase5.AMBRA else ColoreFase5.VERDE)
                                            Column(Modifier.weight(1f)) {
                                                Text(g.titolo, style = Testi.forte, color = c.testo)
                                                Text(listOf(dataIt(g.data), g.segnalataDaNome).filter { it.isNotBlank() }.joinToString(" · "), style = Testi.secondario, color = c.tenue)
                                            }
                                        }
                                        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                            Parola6(g.statoVisto)
                                            if (g.fermo && g.aperta) Parola6("Fermo")
                                            if (g.inCoda) PillolaInCoda()
                                            val nFoto = g.foto.size + g.fotoInAttesa.size
                                            if (nFoto > 0) Parola6(if (nFoto == 1) "1 foto" else "$nFoto foto", colore = ColoreFase5.GRIGIO)
                                        }
                                        if (g.fotoInAttesa.isNotEmpty()) Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { g.fotoInAttesa.take(3).forEach { f -> MiniaturaFoto(f, "Foto del guasto") {} } }
                                    }
                                }
                            }
                        }
                        m.costi?.let { k ->
                            if (perm.costi) Sezione5("Costi dell'anno") {
                                Scheda(orizzontale = 18.dp, verticale = 14.dp, spazio = 6.dp) {
                                    if (k.voci.isEmpty()) Text("Nessun costo nell'anno.", style = Testi.secondario, color = c.tenue)
                                    k.voci.forEach { v -> RigaConto(v.nome + " · " + v.quante, Numeri.euro(v.importo)) }
                                    RigaConto("Totale · " + ContiMezzi.km(k.kmAnno) + " km", Numeri.euro(k.totale))
                                    k.euroKm?.takeIf { it > 0 }?.let { RigaConto("Al km", Numeri.euro(it)) }
                                }
                            }
                        }
                        if (m.assegnazioni.isNotEmpty()) Sezione5("Storico") {
                            SchedaElenco { m.assegnazioni.forEachIndexed { i, a -> if (i > 0) LineaElenco(); RigaVoce(a.chi, sotto = a.tipoVisto + " dal " + dataIt(a.dal) + if (a.inCorso) " · in corso" else " al " + dataIt(a.al), icona = Icone.storia) } }
                        }
                    }
                }
            }
        }
        val m = (l as? Lettura.Pronta)?.dato?.let { InCoda6.applicaMezzo(it, ops) }
        if (m != null && m.delloStudio) {
            val guastoFermo = m.manutenzioni.firstOrNull { it.aperta && it.fermo && !it.inCoda }
            val giallo: Pair<String, () -> Unit>? = when {
                guastoFermo != null && scrive -> "Chiudi il guasto" to { chiudi = guastoFermo }
                m.mio -> "Segna i km" to { km = m }
                m.stato == "disponibile" -> "Lo prendo io" to {
                    if (dati.esempio) avvisi.mostra(SOLO_ESEMPIO) else { dati.fase6.prendi(null, m.id); avvisi.mostra("Preso: il mezzo è in prestito a te") }
                }
                else -> null
            }
            giallo?.let { (t, fai) -> FondoConPulsante(Modifier.align(Alignment.BottomCenter)) { PulsantePrincipale(t, fai, icona = if (t == "Segna i km") Icone.misura else Icone.spunta) } }
        }
    }
    km?.let { FoglioKm(dati, it) { km = null } }
    chiudi?.let { g -> FoglioChiudiGuasto(dati, g) { chiudi = null; giro++ } }
}

@Composable
private fun FoglioChiudiGuasto(dati: Dati, g: eu.stgm.wisper.rapportino.Manutenzione, onChiudi: () -> Unit) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    var esito by remember { mutableStateOf("") }
    var inCorso by remember { mutableStateOf(false) }
    FoglioDalBasso(onChiudi) {
        Text("Chiudi il guasto", style = Testi.titoloScheda, color = c.testo)
        Text(g.titolo, style = Testi.secondarioGrande, color = c.tenue)
        CampoTesto(esito, { esito = it }, "Com'è finita", segnaposto = "Era la valvola, sistemato", righe = 2)
        PulsantePrincipale(if (inCorso) "Salvo…" else "Chiudi il guasto", {
            if (inCorso) return@PulsantePrincipale
            inCorso = true
            ambitoFase3.launch {
                dati.fase6.chiudiGuasto(g.id, esito).onSuccess { avvisi.mostra("Guasto risolto"); Giri6.mezzi++; onChiudi() }.onFailure { avvisi.mostra(spiegaErrore2(it, "Non si è chiuso: riprova")) }
                inCorso = false
            }
        }, icona = Icone.spunta)
    }
}

// ---------------------------------------------------------------------------------- lo strumento

@Composable
fun SchermataStrumento(dati: Dati, nav: Navigatore, id: String) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val perm = LocalPermessi.current
    val ops by dati.operazioni.collectAsStateWithLifecycle()
    var giro by remember { mutableIntStateOf(0) }
    val l = rememberLettura("strumento-$id", giro + Giri6.mezzi * 1000) { dati.fase6.attrezzatura(id) }
    var taratura by remember { mutableStateOf<Attrezzatura?>(null) }
    val scrive = perm.modifica(Moduli.MEZZI)
    val a0 = (l as? Lettura.Pronta)?.dato
    val a = a0?.let { strumentiConCoda(dati, listOf(it)).first() }
    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).padding(top = 10.dp, bottom = 130.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            TestataInterna({ nav.indietro() })
            when {
                l is Lettura.InCorso -> { Segnaposto(90.dp); Segnaposto(200.dp) }
                l is Lettura.Errore -> SchedaErrore(l.messaggio) { giro++ }
                a != null -> {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        CodiceCommessa(a.codice)
                        Parola6(a.statoVisto, colore = a.coloreStato)
                        a.taratura?.let { Parola6(it.parola, colore = it.colore) }
                    }
                    TitoloPagina(a.nome)
                    Text(listOf(a.categoriaNome, a.marca, a.modello, if (a.matricola.isNotBlank()) "matr. ${a.matricola}" else "", a.posizione).filter { it.isNotBlank() }.joinToString(" · "), style = Testi.secondarioGrande, color = c.tenue)
                    if (a.taratura?.stato == ContiMezzi.NON_CONFORME) {
                        Fascia6(a.fraseUsi.ifBlank { "Non conforme: non si usa finché non è tarato di nuovo" }, rossa = true)
                        if (a.usiDaControllare.isNotEmpty()) SchedaElenco { a.usiDaControllare.forEachIndexed { i, u -> if (i > 0) LineaElenco(); RigaUso(u) } }
                    }
                    if (a.mio && a.chi?.tipo == "prestito") PulsanteBordo("Restituisci", {
                        if (dati.esempio) avvisi.mostra(SOLO_ESEMPIO) else { dati.fase6.restituisci(a.id, null); avvisi.mostra("Restituito: parte appena c'è rete") }
                    }, icona = Icone.riapri, altezza = 48.dp)
                    if (a.controllo.isNotBlank()) Sezione5(if (a.controllo == "verifica") "Verifica" else "Taratura") {
                        Scheda(orizzontale = 18.dp, verticale = 14.dp, spazio = 6.dp) {
                            val ultima = a.tarature.firstOrNull()
                            if (ultima != null) Text(ultima.frase.ifBlank { "Tarato il " + dataIt(ultima.data) }, style = Testi.forte, color = c.testo)
                            else Text(if (a.controllo == "verifica") "Verifica non scritta" else "Taratura non scritta", style = Testi.forte, color = c.testo)
                            a.controlloOgniMesi?.let { Text("Ogni $it mesi" + if (a.laboratorio.isNotBlank()) " · " + a.laboratorio else "", style = Testi.secondario, color = c.tenue) }
                            a.tarature.drop(1).take(4).forEach { t -> Text(dataIt(t.data) + " · " + t.esitoVisto + if (t.certificato.isNotBlank()) " · " + t.certificato else "", style = Testi.secondario, color = c.testo2) }
                        }
                    }
                    Sezione5("Chi ce l'ha") {
                        Scheda(orizzontale = 18.dp, verticale = 12.dp, spazio = 2.dp) {
                            Coppia("Adesso", a.chi?.nome ?: a.statoVisto)
                            a.chi?.dal?.takeIf { it.isNotBlank() }?.let { Coppia("Da", dataIt(it)) }
                            a.rientro.takeIf { it.isNotBlank() }?.let { Coppia("Rientro", dataIt(it)) }
                        }
                    }
                    Sezione5("Usato in") {
                        SchedaElenco {
                            if (a.usi.isEmpty()) RigaCalma("Mai usato in un intervento.")
                            a.usi.take(10).forEachIndexed { i, u -> if (i > 0) LineaElenco(); RigaUso(u) }
                        }
                    }
                    if (a.manutenzioni.isNotEmpty()) Sezione5("Guasti") {
                        SchedaElenco { a.manutenzioni.forEachIndexed { i, g -> if (i > 0) LineaElenco(); RigaVoce(g.titolo, sotto = dataIt(g.data) + " · " + g.segnalataDaNome, fine = { Parola6(g.statoVisto) }) } }
                    }
                }
            }
        }
        if (a != null) {
            val st = a.taratura?.stato
            val giallo: Pair<String, () -> Unit>? = when {
                scrive && st in setOf(ContiMezzi.SCADUTA, ContiMezzi.IN_SCADENZA, ContiMezzi.NON_CONFORME, ContiMezzi.LABORATORIO, ContiMezzi.SENZA) ->
                    (if (a.controllo == "verifica") "Registra la verifica" else "Registra la taratura") to { taratura = a }
                a.disponibile && !a.mio && a.taratura?.spento != true -> "Lo prendo io" to {
                    if (dati.esempio) avvisi.mostra(SOLO_ESEMPIO) else { dati.fase6.prendi(a.id, null); avvisi.mostra("Preso: è in prestito a te fino a stasera") }
                }
                else -> null
            }
            giallo?.let { (t, fai) -> FondoConPulsante(Modifier.align(Alignment.BottomCenter)) { PulsantePrincipale(t, fai, icona = Icone.misura) } }
        }
    }
    taratura?.let { x -> FoglioTaratura(dati, x) { taratura = null; giro++ } }
}

@Composable
private fun RigaUso(u: eu.stgm.wisper.rapportino.UsoStrumento) {
    RigaVoce(
        listOf(u.idRapportino, u.ticket).filter { it.isNotBlank() }.joinToString(" · ") + " · " + dataIt(u.data),
        sotto = listOf(u.cliente, u.impianto, u.chi).filter { it.isNotBlank() }.joinToString(" · "),
        icona = Icone.firma,
        fine = {
            when (u.statoAllora) {
                ContiMezzi.SCADUTA -> Parola6("Taratura scaduta" + if (u.confermato) " · confermato" else "")
                ContiMezzi.NON_CONFORME -> Parola6("Non conforme")
                ContiMezzi.VALIDA, ContiMezzi.IN_SCADENZA -> Parola6("Tarato quel giorno", colore = ColoreFase5.VERDE)
                else -> {}
            }
        },
    )
}

/** Registra la taratura (foglio, §12.3): data, esito, scade il (proposta), laboratorio, numero del certificato. */
@Composable
private fun FoglioTaratura(dati: Dati, a: Attrezzatura, onChiudi: () -> Unit) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    var data by remember { mutableStateOf(LocalDate.now()) }
    var esito by remember { mutableStateOf("conforme") }
    var scade by remember { mutableStateOf(LocalDate.now().plusMonths((a.controlloOgniMesi ?: 12).toLong())) }
    var certificato by remember { mutableStateOf("") }
    var errore by remember { mutableStateOf<String?>(null) }
    var inCorso by remember { mutableStateOf(false) }
    FoglioDalBasso(onChiudi) {
        Text(if (a.controllo == "verifica") "Registra la verifica" else "Registra la taratura", style = Testi.titoloScheda, color = c.testo)
        Text(listOf(a.nome, a.codice, if (a.matricola.isNotBlank()) "matr. ${a.matricola}" else "").filter { it.isNotBlank() }.joinToString(" · "), style = Testi.secondario, color = c.tenue)
        Domanda("Esito") { SceltePillole(listOf("conforme" to "Conforme", "regolato" to "Regolato", "non_conforme" to "Non conforme"), esito, { esito = it }) }
        PulsanteData("Data", data) { data = it; scade = it.plusMonths((a.controlloOgniMesi ?: 12).toLong()) }
        if (esito != "non_conforme") PulsanteData("Scade il", scade) { scade = it }
        if (a.laboratorio.isNotBlank()) Coppia("Laboratorio", a.laboratorio)
        CampoTesto(certificato, { certificato = it }, "Numero del certificato", segnaposto = "LAT 1502/26")
        errore?.let { Text(it, style = Testi.secondario, color = c.rossoTesto) }
        PulsantePrincipale(if (inCorso) "Salvo…" else "Salva la taratura", {
            if (inCorso) return@PulsantePrincipale
            inCorso = true
            val o = JSONObject().put("idAttrezzatura", PonteServer.idJson(a.id)).put("data", data.toString()).put("esito", esito)
            if (esito != "non_conforme") o.put("scade", scade.toString())
            if (certificato.isNotBlank()) o.put("certificato", certificato.trim())
            if (a.idLaboratorio.isNotBlank()) o.put("idLaboratorio", a.idLaboratorio)
            ambitoFase3.launch {
                dati.fase6.registraTaratura(o)
                    .onSuccess { (_, frase) -> avvisi.mostra(frase.ifBlank { "Taratura salvata" }); Giri6.mezzi++; onChiudi() }
                    .onFailure { errore = spiegaErrore2(it, "La taratura non si è salvata: riprova") }
                inCorso = false
            }
        }, icona = Icone.spunta)
    }
}

// ---------------------------------------------------------------------------------- segnala un guasto

/** Segnala un guasto (pagina, §12.3): cosa succede, le foto, si può usare, i km; parte anche senza rete, con le foto. */
@Composable
fun SchermataGuasto(dati: Dati, nav: Navigatore, tipo: String, id: String) {
    val c = W.colori
    val ctx = LocalContext.current
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    val mezzo = tipo == "mezzo"
    val nome = if (mezzo) ana.mezzi.firstOrNull { it.id == id }?.titolo else ana.mieiStrumenti.firstOrNull { it.id == id }?.nome
    val letto = if (mezzo) rememberLettura("guasto-mezzo-$id", 0) { dati.fase6.mezzo(id, ana.mezzi.any { it.id == id && it.mio }) } else null
    val m = (letto as? Lettura.Pronta)?.dato
    var titolo by rememberSaveable { mutableStateOf("") }
    var fermo by rememberSaveable { mutableStateOf(false) }
    var km by rememberSaveable { mutableStateOf("") }
    val foto = remember { mutableStateListOf<File>() }
    var scatto by rememberSaveable { mutableStateOf<String?>(null) }
    var errore by remember { mutableStateOf<String?>(null) }
    if (km.isBlank() && m?.km != null) km = m.km.toString()
    val fotocamera = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok ->
        val p = scatto ?: return@rememberLauncherForActivityResult
        scatto = null
        val f = File(p)
        if (!ok) { f.delete(); return@rememberLauncherForActivityResult }
        scope.launch { runCatching { dati.preparaFoto(Uri.fromFile(f)) }.onSuccess { foto.add(it) }.onFailure { avvisi.mostra("La foto non si legge: riprova") }; f.delete() }
    }
    fun segnala() {
        if (titolo.isBlank()) { errore = "Scrivi in poche parole cosa succede"; return }
        if (dati.esempio) { avvisi.mostra(SOLO_ESEMPIO); return }
        dati.fase6.segnalaGuasto(if (mezzo) id else null, if (mezzo) null else id, titolo, fermo, km.filter { it.isDigit() }.toLongOrNull(), LocalDate.now(), foto.toList())
        nav.indietro()
        avvisi.mostra("Guasto segnalato" + (if (foto.isNotEmpty()) " con " + (if (foto.size == 1) "la foto" else "${foto.size} foto") else "") + ": parte appena c'è rete")
    }
    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = 130.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Testata(onIndietro = { nav.indietro() }, chiudi = true)
            TitoloPagina("Segnala un guasto", sopra = (m?.titolo ?: nome).orEmpty().ifBlank { null })
            CampoTesto(titolo, { titolo = it; errore = null }, "Cosa succede", segnaposto = "Spia della pressione delle gomme accesa", errore = errore)
            Domanda("Foto") {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    foto.forEach { f -> MiniaturaFoto(f, "Foto del guasto") { foto.remove(f); f.delete() } }
                    RiquadroFotografa {
                        if (dati.esempio) { avvisi.mostra(SOLO_ESEMPIO); return@RiquadroFotografa }
                        val f = Immagini.fileScatto(ctx); scatto = f.path
                        fotocamera.launch(FileProvider.getUriForFile(ctx, ctx.packageName + ".foto", f))
                    }
                }
            }
            Domanda("Si può usare?") { SceltePillole(listOf(false to "Sì", true to "No, è fermo"), fermo, { fermo = it }) }
            if (mezzo) CampoTesto(km, { km = it.filter { ch -> ch.isDigit() } }, "Km", tastiera = KeyboardType.Number, suffisso = "km")
        }
        FondoConPulsante(Modifier.align(Alignment.BottomCenter)) { PulsantePrincipale("Segnala il guasto", { segnala() }, icona = Icone.allarme) }
    }
}

// ---------------------------------------------------------------------------------- aggiungi un mezzo, uno strumento

/** Aggiungi un mezzo (mezzi 2): nome, targa, tipo, di chi è, immatricolazione; la revisione la propone il server. */
@Composable
fun SchermataNuovoMezzo(dati: Dati, nav: Navigatore) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    var nome by rememberSaveable { mutableStateOf("") }
    var targa by rememberSaveable { mutableStateOf("") }
    var tipo by rememberSaveable { mutableStateOf("furgone") }
    var studio by rememberSaveable { mutableStateOf(true) }
    var immatricolazione by remember { mutableStateOf(LocalDate.now()) }
    var errore by remember { mutableStateOf<String?>(null) }
    var inCorso by remember { mutableStateOf(false) }
    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = 130.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Testata(onIndietro = { nav.indietro() }, chiudi = true)
            TitoloPagina("Aggiungi un mezzo")
            CampoTesto(nome, { nome = it; errore = null }, "Nome", segnaposto = "Fiat Doblò")
            CampoTesto(targa, { targa = it.uppercase().filter { ch -> ch.isLetterOrDigit() } }, "Targa")
            Domanda("Tipo") { SceltePillole(listOf("auto" to "Auto", "furgone" to "Furgone", "moto" to "Moto", "altro" to "Altro"), tipo, { tipo = it }) }
            Domanda("Di chi è") { SceltePillole(listOf(true to "Dello studio", false to "Auto di una persona"), studio, { studio = it }) }
            PulsanteData("Immatricolazione", immatricolazione) { immatricolazione = it }
            errore?.let { Text(it, style = Testi.secondarioGrande, color = c.rossoTesto) }
        }
        FondoConPulsante(Modifier.align(Alignment.BottomCenter)) {
            PulsantePrincipale(if (inCorso) "Salvo…" else "Salva il mezzo", {
                if (nome.isBlank()) { errore = "Nome: scrivi il nome del mezzo"; return@PulsantePrincipale }
                if (dati.esempio) { avvisi.mostra(SOLO_ESEMPIO); return@PulsantePrincipale }
                if (inCorso) return@PulsantePrincipale
                inCorso = true
                val o = JSONObject().put("nome", nome.trim()).put("targa", targa).put("tipo", tipo).put("proprieta", if (studio) "studio" else "persona").put("immatricolazione", immatricolazione.toString())
                ambitoFase3.launch {
                    dati.fase6.salvaMezzo(o).onSuccess { mz -> nav.indietro(); nav.vai("mezzo/${mz.id}"); avvisi.mostra("Mezzo salvato"); Giri6.mezzi++ }
                        .onFailure { errore = spiegaErrore2(it, "Il mezzo non si è salvato: riprova") }
                    inCorso = false
                }
            })
        }
    }
}

/** Aggiungi uno strumento (mezzi 2): il codice lo propone il server (AT007), matricola, taratura ogni 12 mesi. */
@Composable
fun SchermataNuovoStrumento(dati: Dati, nav: Navigatore) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    var nome by rememberSaveable { mutableStateOf("") }
    var categoria by rememberSaveable { mutableStateOf("strumento") }
    var marca by rememberSaveable { mutableStateOf("") }
    var matricola by rememberSaveable { mutableStateOf("") }
    var ogni by rememberSaveable { mutableStateOf("12") }
    var errore by remember { mutableStateOf<String?>(null) }
    var inCorso by remember { mutableStateOf(false) }
    val codice = ana.numerazione("attrezzatura")?.prossimoNumero().orEmpty()
    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = 130.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Testata(onIndietro = { nav.indietro() }, chiudi = true)
            TitoloPagina("Aggiungi uno strumento", sopra = codice.ifBlank { null })
            CampoTesto(nome, { nome = it; errore = null }, "Cos'è", segnaposto = "Multimetro 87V")
            Domanda("Categoria") { SceltePillole(listOf("strumento" to "Strumenti di misura", "attrezzo" to "Attrezzi", "informatica" to "Informatica", "dpi" to "DPI", "altro" to "Altro"), categoria, { categoria = it }) }
            CampoTesto(marca, { marca = it }, "Marca e modello")
            CampoTesto(matricola, { matricola = it }, "Matricola")
            if (categoria == "strumento" || categoria == "dpi") CampoTesto(ogni, { ogni = it.filter { ch -> ch.isDigit() } }, if (categoria == "dpi") "Verifica ogni" else "Taratura ogni", tastiera = KeyboardType.Number, suffisso = "mesi")
            errore?.let { Text(it, style = Testi.secondarioGrande, color = c.rossoTesto) }
        }
        FondoConPulsante(Modifier.align(Alignment.BottomCenter)) {
            PulsantePrincipale(if (inCorso) "Salvo…" else "Salva lo strumento", {
                if (nome.isBlank()) { errore = "Nome: scrivi cos'è"; return@PulsantePrincipale }
                if (dati.esempio) { avvisi.mostra(SOLO_ESEMPIO); return@PulsantePrincipale }
                if (inCorso) return@PulsantePrincipale
                inCorso = true
                val o = JSONObject().put("nome", nome.trim()).put("categoria", categoria).put("marca", marca.trim()).put("matricola", matricola.trim())
                if (categoria == "strumento" || categoria == "dpi") o.put("controllo", if (categoria == "dpi") "verifica" else "taratura").put("controlloOgniMesi", ogni.toIntOrNull() ?: 12)
                ambitoFase3.launch {
                    dati.fase6.salvaAttrezzatura(o).onSuccess { a -> nav.indietro(); nav.vai("strumento/${a.id}"); avvisi.mostra("Salvato: " + a.codice); Giri6.mezzi++ }
                        .onFailure { errore = spiegaErrore2(it, "Lo strumento non si è salvato: riprova") }
                    inCorso = false
                }
            })
        }
    }
}

/** In prestito alla commessa (§12.8): mezzi e strumenti ancora fuori, in rosso tenue quelli oltre il rientro. */
@Composable
internal fun InPrestitoAllaCommessa(dati: Dati, idCommessa: String, nav: Navigatore) {
    if (dati.esempio || !LocalPermessi.current.vede(Moduli.MEZZI)) return
    val l = rememberLettura("prestiti-commessa-$idCommessa", Giri6.mezzi) { dati.fase6.assegnazioniCommessa(idCommessa) }
    val lista = (l as? Lettura.Pronta)?.dato.orEmpty()
    if (lista.isEmpty()) return
    Sezione5("In prestito alla commessa", lista.size) {
        SchedaElenco {
            lista.forEachIndexed { i, a ->
                if (i > 0) LineaElenco()
                RigaVoce(
                    a.oggetto, sotto = "dal " + dataIt(a.dal) + if (a.rientro.isNotBlank()) " · rientro il " + dataIt(a.rientro) else "",
                    icona = if (a.idVeicolo.isNotBlank()) Icone.mezzo else Icone.misura,
                    fine = if (a.inRitardo) ({ Parola6("Oltre il rientro", colore = ColoreFase5.ROSSO) }) else null,
                    onClick = { nav.sezione(Sezione.MEZZI); nav.vai(if (a.idVeicolo.isNotBlank()) "mezzo/${a.idVeicolo}" else "strumento/${a.idAttrezzatura}") },
                )
            }
        }
    }
}
