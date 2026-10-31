@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package eu.stgm.wisper.ui

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
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
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import eu.stgm.wisper.Dati
import eu.stgm.wisper.rapportino.ColoreFase5
import eu.stgm.wisper.rapportino.Collaboratore
import eu.stgm.wisper.rapportino.Compensi
import eu.stgm.wisper.rapportino.Incarico
import eu.stgm.wisper.rapportino.Moduli
import eu.stgm.wisper.rapportino.Numeri
import eu.stgm.wisper.rapportino.PonteServer
import eu.stgm.wisper.rapportino.dataIt
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import eu.stgm.wisper.rapportino.Stampa
import java.time.LocalDate

/*
 * 16 Collaboratori esterni sul telefono (fase6.md §12.5): Collaboratori · Incarichi ·
 * Compensi · Documenti (Compensi solo con i soldi). L'esterno vede solo la sua scheda
 * ("La tua scheda", §12.7): i suoi documenti, i suoi incarichi, i suoi compensi.
 */

enum class SegmentoCollaboratori(val nome: String) { ELENCO("Collaboratori"), INCARICHI("Incarichi"), COMPENSI("Compensi"), DOCUMENTI("Documenti") }

enum class FiltroIncarichi(val nome: String, val stato: String) { IN_CORSO("In corso", "aperti"), BOZZE("Bozze", "bozze"), CONCLUSI("Conclusi", "conclusi"), DA_VALUTARE("Da valutare", "conclusi") }

object RicordoCollaboratori {
    var segmento by mutableStateOf(SegmentoCollaboratori.ELENCO)
    var filtro by mutableStateOf(FiltroIncarichi.IN_CORSO)

    fun mostra(segmento: String) {
        this.segmento = when (segmento) {
            "incarichi" -> SegmentoCollaboratori.INCARICHI
            "compensi" -> SegmentoCollaboratori.COMPENSI
            "documenti" -> SegmentoCollaboratori.DOCUMENTI
            else -> SegmentoCollaboratori.ELENCO
        }
    }
}

@Composable
fun SchermataCollaboratori(dati: Dati, nav: Navigatore) {
    val c = W.colori
    val perm = LocalPermessi.current
    val sessione by dati.sessione.collectAsStateWithLifecycle()
    if (sessione.esterno) {
        SchedaCollaboratore(dati, nav, sessione.interfaccia.esternoId, sua = true)
        return
    }
    val scrive = perm.modifica(Moduli.COLLABORATORI)
    val voci = SegmentoCollaboratori.entries.filter { it != SegmentoCollaboratori.COMPENSI || perm.costi }
    val seg = RicordoCollaboratori.segmento.takeIf { it in voci } ?: SegmentoCollaboratori.ELENCO
    var documento by remember { mutableStateOf(false) }
    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).padding(top = 10.dp, bottom = 130.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            TestataInterna({ nav.indietro() })
            TitoloPagina("Collaboratori esterni")
            SegmentiScorrevoli(voci.map { it to it.nome }, seg, { RicordoCollaboratori.segmento = it })
            when (seg) {
                SegmentoCollaboratori.ELENCO -> PaginaElencoCollaboratori(dati, nav)
                SegmentoCollaboratori.INCARICHI -> PaginaIncarichi(dati, nav)
                SegmentoCollaboratori.COMPENSI -> PaginaCompensi(dati, nav)
                SegmentoCollaboratori.DOCUMENTI -> PaginaDocumentiCollaboratori(dati, nav)
            }
        }
        val giallo: Pair<String, () -> Unit>? = when (seg) {
            SegmentoCollaboratori.ELENCO -> if (scrive) "Nuovo collaboratore" to { nav.vai("collaboratore-nuovo") } else null
            SegmentoCollaboratori.DOCUMENTI -> if (scrive) "Aggiungi un documento" to { documento = true } else null
            else -> null
        }
        giallo?.let { (t, fai) -> FondoConPulsante(Modifier.align(Alignment.BottomCenter)) { PulsantePrincipale(t, fai, icona = Icone.piu) } }
    }
    if (documento) FoglioDocumentoCollaboratore(dati, null) { documento = false }
}

@Composable
private fun PaginaElencoCollaboratori(dati: Dati, nav: Navigatore) {
    val c = W.colori
    var giro by remember { mutableIntStateOf(0) }
    val l = rememberLettura("collaboratori", giro + Giri6.collaboratori * 1000) { dati.fase6.collaboratori() }
    when (l) {
        is Lettura.InCorso -> Segnaposto(160.dp)
        is Lettura.Errore -> SchedaErrore(l.messaggio) { giro++ }
        is Lettura.Pronta -> SchedaElenco {
            if (l.dato.isEmpty()) RigaCalma("Nessun collaboratore esterno.")
            l.dato.forEachIndexed { i, k ->
                if (i > 0) LineaElenco()
                RigaVoce(
                    k.nome, sotto = listOf(k.tipoNome, k.mestiere).filter { it.isNotBlank() }.joinToString(" · ") + "\n" +
                        (if (k.incarichiInCorso > 0) Testo.quanti(k.incarichiInCorso, "incarico in corso", "incarichi in corso") else "Nessun incarico in corso"),
                    inizio = { CerchioPersona(eu.stgm.wisper.rapportino.Utente("", k.nome).iniziali, 40.dp) },
                    fine = { k.idoneita?.let { Parola6(it.parola, colore = it.colore) } },
                    onClick = { nav.vai("collaboratore/${k.idSoggetto}") },
                )
            }
        }
    }
}

@Composable
private fun RigaIncarico(i: Incarico, conCollaboratore: Boolean, onClick: () -> Unit) {
    RigaVoce(
        i.numero + " · " + i.titolo,
        sotto = listOf(i.idCommessa, if (conCollaboratore) i.collaboratore else i.commessa).filter { it.isNotBlank() }.joinToString(" · ") + "\n" +
            (if (i.modo == "ore") "A ore · " + Numeri.scrivi(i.oreApprovate) + " ore" + (i.orePreviste?.let { " su " + Numeri.scrivi(it) } ?: "") else "A corpo · avanzamento ${i.avanzamento}%"),
        inizio = { IconaColorata(Icone.collab, i.colore) },
        fine = {
            Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Parola6(i.statoVisto, colore = i.colore)
                if (i.valutazioneVista.isNotBlank()) Parola6(i.valutazioneVista)
            }
        },
        onClick = onClick,
    )
}

@Composable
private fun PaginaIncarichi(dati: Dati, nav: Navigatore) {
    var giro by remember { mutableIntStateOf(0) }
    val f = RicordoCollaboratori.filtro
    PilloleFiltro(FiltroIncarichi.entries.map { it to it.nome }, f, { RicordoCollaboratori.filtro = it })
    val l = rememberLettura("incarichi-${f.stato}", giro + Giri6.collaboratori * 1000) { dati.fase6.incarichi(f.stato) }
    when (l) {
        is Lettura.InCorso -> Segnaposto(160.dp)
        is Lettura.Errore -> SchedaErrore(l.messaggio) { giro++ }
        is Lettura.Pronta -> {
            val lista = if (f == FiltroIncarichi.DA_VALUTARE) l.dato.filter { it.daValutare || (it.stato == "concluso" && it.valutazione.isBlank()) } else l.dato
            SchedaElenco {
                if (lista.isEmpty()) RigaCalma("Niente qui.")
                lista.forEachIndexed { i, x -> if (i > 0) LineaElenco(); RigaIncarico(x, conCollaboratore = true) { nav.vai("incarico/${x.id}") } }
            }
        }
    }
}

@Composable
private fun PaginaCompensi(dati: Dati, nav: Navigatore) {
    val ctx = LocalContext.current
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    var giro by remember { mutableIntStateOf(0) }
    val l = rememberLettura("compensi", giro + Giri6.collaboratori * 1000) { dati.fase6.compensi() }
    when (l) {
        is Lettura.InCorso -> Segnaposto(160.dp)
        is Lettura.Errore -> SchedaErrore(l.messaggio) { giro++ }
        is Lettura.Pronta -> {
            val (righe, totale) = l.dato
            SchedaElenco {
                if (righe.isEmpty()) RigaCalma("Nessun compenso quest'anno.")
                righe.forEachIndexed { i, r ->
                    if (i > 0) LineaElenco()
                    RigaVoce(r.nome, sotto = "Maturato " + Numeri.euro(r.compensi.maturato) + " · fatturato " + Numeri.euro(r.compensi.fatturato) + "\n" +
                        (if (r.compensi.daFatturare > 0) "da fatturare" else "niente da fatturare"),
                        valore = if (r.compensi.daFatturare > 0) Numeri.euro(r.compensi.daFatturare) else null,
                        onClick = { nav.vai("collaboratore/${r.idSoggetto}") })
                }
            }
            totale?.let { t -> Scheda(orizzontale = 18.dp, verticale = 14.dp, spazio = 6.dp) { ContiCompensi(t, "Pagato") } }
            PulsanteBordo("Esporta", {
                avvisi.mostra("Preparo il file…")
                scope.launch { dati.fase5.esporta("compensi").onSuccess { condividiFile(ctx, it, "I compensi", "text/csv") }.onFailure { avvisi.mostra(spiegaErrore2(it, "Il file non si è preparato: riprova")) } }
            }, Modifier.fillMaxWidth(), icona = Icone.scarica)
        }
    }
}

@Composable
private fun ContiCompensi(k: Compensi, pagato: String) {
    RigaConto("Pattuito", Numeri.euro(k.pattuito))
    RigaConto("Maturato", Numeri.euro(k.maturato))
    RigaConto("Fatturato", Numeri.euro(k.fatturato))
    RigaConto("Da fatturare", Numeri.euro(k.daFatturare))
    RigaConto(if (pagato == "Pagato") "Da pagare" else pagato, Numeri.euro(k.daPagare))
}

@Composable
private fun PaginaDocumentiCollaboratori(dati: Dati, nav: Navigatore) {
    var giro by remember { mutableIntStateOf(0) }
    val l = rememberLettura("scadenze-collaboratori", giro + Giri6.collaboratori * 1000) { dati.fase5.scadenzeDi(listOf("gruppo" to "collaboratori")) }
    when (l) {
        is Lettura.InCorso -> Segnaposto(160.dp)
        is Lettura.Errore -> SchedaErrore(l.messaggio) { giro++ }
        is Lettura.Pronta -> {
            val e = l.dato
            if (e.scadute.isEmpty() && e.entro.isEmpty() && e.piuAvanti.isEmpty()) Scheda(orizzontale = 18.dp, verticale = 16.dp) { RigaCalma("Nessun documento con la scadenza.") }
            listOf("Scaduti" to e.scadute, "Nel preavviso" to e.entro, "Validi" to e.piuAvanti).forEach { (nome, lista) ->
                if (lista.isNotEmpty()) Sezione5(nome, lista.size) {
                    SchedaElenco { lista.forEachIndexed { i, s -> if (i > 0) LineaElenco(); RigaScadenza(s) { if (s.idSoggetto.isNotBlank() || s.idCliente.isNotBlank()) nav.vai("collaboratore/${s.idSoggetto.ifBlank { s.idCliente }}") } } }
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------------- la scheda del collaboratore

@Composable
fun SchermataCollaboratore(dati: Dati, nav: Navigatore, id: String) = SchedaCollaboratore(dati, nav, id, sua = false)

@Composable
private fun SchedaCollaboratore(dati: Dati, nav: Navigatore, id: String, sua: Boolean) {
    val c = W.colori
    val perm = LocalPermessi.current
    var giro by remember { mutableIntStateOf(0) }
    val l = rememberLettura("collaboratore-$id-$sua", giro + Giri6.collaboratori * 1000) { dati.fase6.collaboratore(if (sua) null else id, mia = sua) }
    var documento by remember { mutableStateOf(false) }
    var accesso by remember { mutableStateOf(false) }
    val scrive = perm.modifica(Moduli.COLLABORATORI)
    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).padding(top = 10.dp, bottom = 130.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            TestataInterna({ nav.indietro() })
            if (sua) TitoloPagina("La tua scheda")
            when (l) {
                is Lettura.InCorso -> { Segnaposto(90.dp); Segnaposto(200.dp) }
                is Lettura.Errore -> SchedaErrore(l.messaggio) { giro++ }
                is Lettura.Pronta -> CorpoCollaboratore(dati, nav, l.dato, sua, scrive, onDocumento = { documento = true }, onAccesso = { accesso = true })
            }
        }
        val k = (l as? Lettura.Pronta)?.dato
        if (k != null) {
            val giallo: Pair<String, () -> Unit>? = when {
                sua -> "Carica un documento" to { documento = true }
                scrive && perm.costi -> "Nuovo incarico" to { nav.vai("incarico-nuovo/${k.idSoggetto}") }
                else -> null
            }
            giallo?.let { (t, fai) -> FondoConPulsante(Modifier.align(Alignment.BottomCenter)) { PulsantePrincipale(t, fai, icona = if (sua) Icone.carica else Icone.piu) } }
        }
    }
    val k = (l as? Lettura.Pronta)?.dato
    if (documento && k != null) FoglioDocumentoCollaboratore(dati, k.idSoggetto) { documento = false; giro++ }
    if (accesso && k != null) FoglioInvitaEsterno(dati, k) { accesso = false; giro++ }
}

@Composable
private fun CorpoCollaboratore(dati: Dati, nav: Navigatore, k: Collaboratore, sua: Boolean, scrive: Boolean, onDocumento: () -> Unit, onAccesso: () -> Unit) {
    val c = W.colori
    val perm = LocalPermessi.current
    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        if (k.tipoNome.isNotBlank()) Parola6(k.tipoNome, colore = ColoreFase5.GRIGIO)
        k.idoneita?.let { Parola6(it.parola, colore = it.colore) }
    }
    Text(k.nome, style = Testi.titoloScheda, color = c.testo)
    Text(listOf(k.mestiere, k.abilitazioni).filter { it.isNotBlank() }.joinToString(" · "), style = Testi.secondarioGrande, color = c.tenue)
    k.idoneita?.frase?.takeIf { it.isNotBlank() && k.idoneita.stato != "in_regola" }?.let { Fascia6(it, rossa = k.idoneita.stato == "scaduti") }
    Sezione5("Idoneità") {
        SchedaElenco {
            if (k.documenti.isEmpty() && k.tipo != "occasionale") RigaCalma("Nessun documento.")
            k.documenti.forEachIndexed { i, d ->
                if (i > 0) LineaElenco()
                RigaVoce(d.titolo, sotto = "Del " + dataIt(d.data) + if (d.scade.isNotBlank()) " · fino al " + dataIt(d.scade) else "", icona = Icone.documento, fine = { Parola6(d.statoVisto) })
            }
            if (k.tipo == "occasionale") RigaVoce("Niente documenti da chiedere", sotto = "Prestazione occasionale", icona = Icone.documento)
            if (k.tipo == "impresa") { LineaElenco(); Row(Modifier.fillMaxWidth().heightIn(min = 56.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("Scarica il DURC dal portale DURC On Line", style = Testi.forte.copy(fontWeight = FontWeight.Bold), color = c.testo2, modifier = Modifier.weight(1f)); PillolaNonCollegato()
            } }
            if (scrive && !sua) { LineaElenco(); RigaAzione("Aggiungi un documento", onClick = onDocumento) }
        }
    }
    Sezione5("Incarichi") {
        SchedaElenco {
            if (k.incarichi.isEmpty()) RigaCalma("Nessun incarico.")
            k.incarichi.forEachIndexed { i, x -> if (i > 0) LineaElenco(); RigaIncarico(x, conCollaboratore = false) { nav.vai("incarico/${x.id}") } }
        }
    }
    k.compensi?.let { comp -> Sezione5(if (sua) "I tuoi compensi" else "Compensi") { Scheda(orizzontale = 18.dp, verticale = 14.dp, spazio = 6.dp) { ContiCompensi(comp, "Pagato") } } }
    if (!sua) k.valutazioni?.let { v -> Sezione5("Valutazioni") {
        Scheda(orizzontale = 18.dp, verticale = 14.dp) {
            if (v.totale == 0) Text("Ancora nessuna valutazione.", style = Testi.secondario, color = c.tenue)
            else FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                if (v.bene > 0) Parola6("${v.bene} bene", colore = ColoreFase5.VERDE)
                if (v.problemi > 0) Parola6("${v.problemi} con qualche problema", colore = ColoreFase5.AMBRA)
                if (v.male > 0) Parola6("${v.male} male", colore = ColoreFase5.ROSSO)
            }
        }
    } }
    if (!sua) Sezione5("Accesso a Wisper") {
        SchedaElenco {
            if (k.accessi.isEmpty()) RigaCalma("Nessuno di loro entra in Wisper.")
            k.accessi.forEachIndexed { i, a ->
                if (i > 0) LineaElenco()
                RigaVoce(a.nome, sotto = "Esterno · ultimo accesso " + (eu.stgm.wisper.rapportino.istanteLocale(a.ultimoAccesso)?.let { quandoCorto(a.ultimoAccesso) } ?: "mai"),
                    inizio = { CerchioPersona(eu.stgm.wisper.rapportino.Utente("", a.nome).iniziali, 36.dp) })
            }
            if (perm.modifica(Moduli.AMMINISTRAZIONE)) { LineaElenco(); RigaAzione("Dai l'accesso a Wisper", Icone.esci, onAccesso) }
        }
    }
    Sezione5("Contatti") {
        Scheda(orizzontale = 18.dp, verticale = 12.dp, spazio = 2.dp) {
            if (k.telefono.isNotBlank()) Coppia("Telefono", k.telefono)
            if (k.email.isNotBlank()) Coppia("Email", k.email)
            if (k.citta.isNotBlank()) Coppia("Città", k.citta)
            if (k.partitaIva.isNotBlank()) Coppia("Partita IVA", k.partitaIva)
            if (k.referente.isNotBlank()) Coppia("Segue lo studio", k.referente)
            k.tariffa?.let { Coppia("Tariffa proposta", Numeri.euro(it) + " l'ora") }
        }
    }
}

/** Aggiungi un documento del collaboratore (DURC, visura, polizza...): il tipo, il file, la data; la scadenza la propone il server. */
@Composable
private fun FoglioDocumentoCollaboratore(dati: Dati, idSoggetto: String?, onChiudi: () -> Unit) {
    val c = W.colori
    val ctx = LocalContext.current
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    val elenco = if (idSoggetto == null) rememberLettura("collaboratori-doc", 0) { dati.fase6.collaboratori() } else null
    var chi by remember { mutableStateOf(idSoggetto.orEmpty()) }
    var tipo by remember { mutableStateOf("durc") }
    var data by remember { mutableStateOf(LocalDate.now()) }
    var file by remember { mutableStateOf<Triple<String, String, ByteArray>?>(null) }
    var errore by remember { mutableStateOf<String?>(null) }
    var inCorso by remember { mutableStateOf(false) }
    val scegli = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri: Uri? ->
        if (uri != null) runCatching { leggiFileScelto(ctx, uri) }.onSuccess { file = it }.onFailure { errore = it.message }
    }
    val nomi = mapOf("durc" to "DURC", "visura" to "Visura", "idoneita" to "Autocertificazione di idoneità", "polizza" to "Polizza", "albo" to "Iscrizione all'albo", "altro" to "Altro")
    FoglioDalBasso(onChiudi) {
        Text("Aggiungi un documento", style = Testi.titoloScheda, color = c.testo)
        if (idSoggetto == null) {
            val l = (elenco as? Lettura.Pronta)?.dato.orEmpty()
            SceltePillole(l.map { it.idSoggetto to it.nome }, chi, { chi = it })
        }
        SceltePillole(nomi.entries.map { it.key to it.value }, tipo, { tipo = it })
        PulsanteData("Data del documento", data) { data = it }
        PulsanteBordo(file?.first ?: "Scegli il file", { scegli.launch(arrayOf("application/pdf", "image/*")) }, Modifier.fillMaxWidth(), icona = Icone.graffetta)
        errore?.let { Text(it, style = Testi.secondario, color = c.rossoTesto) }
        PulsantePrincipale(if (inCorso) "Carico…" else "Salva il documento", {
            val f = file
            if (chi.isBlank()) { errore = "Scegli il collaboratore"; return@PulsantePrincipale }
            if (f == null) { errore = "Scegli il file"; return@PulsantePrincipale }
            if (dati.esempio) { avvisi.mostra(SOLO_ESEMPIO); onChiudi(); return@PulsantePrincipale }
            if (inCorso) return@PulsantePrincipale
            inCorso = true
            scope.launch {
                val cat = dati.fase5.categorie().getOrNull()?.firstOrNull { it.nome == "Documenti dei collaboratori" }
                dati.fase5.carica(f.first, f.second, f.third, per = "collaboratore")
                    .mapCatching { car ->
                        val o = JSONObject().put("origine", "file").put("idFile", car.id).put("titolo", nomi[tipo]).put("idSoggetto", chi).put("dataDocumento", data.toString())
                        if (tipo != "altro") o.put("tipoScadenza", tipo)
                        cat?.let { o.put("idCategoria", PonteServer.idJson(it.id)) }
                        dati.fase5.salvaDocumento(o).getOrThrow()
                    }
                    .onSuccess { avvisi.mostra("Documento salvato"); Giri6.collaboratori++; onChiudi() }
                    .onFailure { errore = spiegaErrore2(it, "Il documento non si è salvato: riprova") }
                inCorso = false
            }
        }, icona = Icone.carica)
    }
}

@Composable
private fun FoglioInvitaEsterno(dati: Dati, k: Collaboratore, onChiudi: () -> Unit) {
    val c = W.colori
    var nome by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf<String?>(null) }
    var errore by remember { mutableStateOf<String?>(null) }
    var inCorso by remember { mutableStateOf(false) }
    FoglioDalBasso(onChiudi) {
        Text("Dai l'accesso a Wisper", style = Testi.titoloScheda, color = c.testo)
        Text(k.nome, style = Testi.secondarioGrande, color = c.tenue)
        val pw = password
        if (pw != null) {
            Text("Password iniziale: $pw", style = Testi.titoloSezione, color = c.testo)
            Text("Si vede solo adesso. Vedrà solo le commesse dei suoi incarichi.", style = Testi.secondario, color = c.testo2)
            PulsanteBordo("Fatto", onChiudi, Modifier.fillMaxWidth())
        } else {
            CampoTesto(nome, { nome = it }, "Nome")
            CampoTesto(email, { email = it }, "Email", tastiera = KeyboardType.Email)
            errore?.let { Text(it, style = Testi.secondario, color = c.rossoTesto) }
            PulsantePrincipale(if (inCorso) "Creo…" else "Crea l'accesso", {
                if (inCorso) return@PulsantePrincipale
                inCorso = true
                ambitoFase3.launch {
                    dati.fase6.invitaEsterno(k.idSoggetto, nome, email).onSuccess { password = it.ifBlank { "—" } }.onFailure { errore = spiegaErrore2(it, "L'accesso non è stato creato: riprova") }
                    inCorso = false
                }
            })
        }
    }
}

// ---------------------------------------------------------------------------------- l'incarico

@Composable
fun SchermataIncarico(dati: Dati, nav: Navigatore, id: String) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val perm = LocalPermessi.current
    val sessione by dati.sessione.collectAsStateWithLifecycle()
    var giro by remember { mutableIntStateOf(0) }
    val l = rememberLettura("incarico-$id", giro + Giri6.collaboratori * 1000) { dati.fase6.incarico(id) }
    var foglio by remember { mutableStateOf("") }
    val scrive = perm.modifica(Moduli.COLLABORATORI) && !sessione.esterno
    fun azione(nome: String, campi: JSONObject = JSONObject(), fatto: String) {
        ambitoFase3.launch {
            dati.fase6.azioneIncarico(nome, id, campi)
                .onSuccess { avvisi.mostra(fatto); Giri6.collaboratori++; giro++ }
                .onFailure { e ->
                    val dc = daConfermare(e)
                    if (dc != null) foglio = "affida:" + dc.message.orEmpty() else avvisi.mostra(spiegaErrore2(e, "Non è andata: riprova"))
                }
        }
    }
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
                    val i = l.dato
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        CodiceCommessa(i.idCommessa)
                        Parola6(i.statoVisto, colore = i.colore)
                        if (i.valutazioneVista.isNotBlank()) Parola6(i.valutazioneVista)
                    }
                    TitoloPagina(i.titolo)
                    Text(listOf(i.numero, i.collaboratore, i.commessa, i.cliente).filter { it.isNotBlank() }.joinToString(" · "), style = Testi.secondarioGrande, color = c.tenue)
                    if ((i.stato == "bozza" || i.stato == "affidato") && i.idoneita != null && !i.idoneita.inRegola) Fascia6(i.idoneita.frase.ifBlank { i.idoneita.parola })
                    if (i.occasionale) RigaNonCollegato("Comunicazione all'Ispettorato del lavoro")
                    if (i.descrizione.isNotBlank()) Scheda(orizzontale = 18.dp, verticale = 12.dp) { Text(i.descrizione, style = Testi.testo, color = c.testo2) }
                    if (i.modo == "corpo") Sezione5("Avanzamento") {
                        Scheda(orizzontale = 18.dp, verticale = 14.dp, spazio = 8.dp) {
                            Row(Modifier.fillMaxWidth()) {
                                Text("${i.avanzamento}%", style = Testi.titoloSezione, color = c.testo, modifier = Modifier.weight(1f))
                                if (i.dal.isNotBlank()) Text("dal " + dataIt(i.dal) + if (i.al.isNotBlank()) " al " + dataIt(i.al) else "", style = Testi.secondario, color = c.tenue)
                            }
                            BarraAvanzamento(i.avanzamento)
                        }
                    }
                    i.conti?.let { k -> Sezione5(if (sessione.esterno) "I tuoi soldi" else "Soldi") { Scheda(orizzontale = 18.dp, verticale = 14.dp, spazio = 6.dp) { ContiCompensi(k, "Pagato") } } }
                    // Le ore e i rapportini sull'incarico; quelle di un collaboratore senza accesso le scrive chi lo segue.
                    Sezione5("Ore e rapportini") {
                        SchedaElenco {
                            if (i.ore.isEmpty() && i.rapportini.isEmpty()) RigaCalma("Ancora nessuna ora.")
                            i.ore.forEachIndexed { n, o -> if (n > 0) LineaElenco(); RigaVoce(Numeri.scrivi(o.ore) + " ore · " + dataIt(o.data), sotto = listOf(o.descrizione, o.stato).filter { it.isNotBlank() }.joinToString(" · "), icona = Icone.ore) }
                            i.rapportini.forEachIndexed { n, r ->
                                if (n > 0 || i.ore.isNotEmpty()) LineaElenco()
                                RigaVoce(
                                    r.id.ifBlank { "Rapportino" } + " · " + dataIt(r.data), sotto = listOf(r.descrizione, Numeri.ore(r.ore)).filter { it.isNotBlank() }.joinToString(" · "), icona = Icone.firma,
                                    onClick = if (r.id.isNotBlank()) ({ nav.sezione(Sezione.RAPPORTINI, FiltroRapportini(mese = null, testo = r.id)) }) else null,
                                )
                            }
                        }
                        if (scrive && i.stato == "affidato" && i.modo == "ore" && !i.collaboratoreHaAccesso) {
                            PulsanteBordo("Ore del collaboratore", { foglio = "ore" }, Modifier.fillMaxWidth(), icona = Icone.piu, altezza = 48.dp)
                        }
                    }
                    if (i.spese.isNotEmpty()) Sezione5("Spese") {
                        SchedaElenco {
                            i.spese.forEachIndexed { n, x ->
                                if (n > 0) LineaElenco()
                                RigaVoce(x.descrizione.ifBlank { "Spesa" }, sotto = dataIt(x.data), icona = Icone.scontrino, fine = x.importo?.let { e -> { Text(Numeri.euro(e), style = Testi.forte, color = c.testo) } })
                            }
                        }
                    }
                    Sezione5("Fatture ricevute") {
                        SchedaElenco {
                            if (i.ricevute.isEmpty()) RigaCalma("Ancora nessuna fattura.")
                            i.ricevute.forEachIndexed { n, r ->
                                if (n > 0) LineaElenco()
                                RigaVoce(
                                    "Fattura " + r.numero + " · " + dataIt(r.data), sotto = r.imponibile?.let { "Imponibile " + Numeri.euro(it) }, icona = Icone.fatturazione,
                                    fine = { Parola6(r.statoPagamento, colore = if (r.statoPagamento == "Pagata") ColoreFase5.VERDE else ColoreFase5.AMBRA) },
                                    onClick = if (perm.vede(Moduli.FATTURAZIONE) && perm.costi && !sessione.esterno) ({ nav.vai("ricevuta/${r.id}") }) else null,
                                )
                            }
                        }
                        if (scrive && perm.modifica(Moduli.FATTURAZIONE) && i.stato != "annullato") {
                            PulsanteBordo("Collega una fattura ricevuta", { foglio = "collega" }, Modifier.fillMaxWidth(), icona = Icone.piu, altezza = 48.dp)
                        }
                    }
                    if (i.documenti.isNotEmpty() || (scrive && perm.modifica(Moduli.DOCUMENTI))) Sezione5("Documenti") {
                        if (i.documenti.isNotEmpty()) SchedaElenco { i.documenti.forEachIndexed { n, d -> if (n > 0) LineaElenco(); RigaDocumento(d) { nav.vai("documento/${d.id}") } } }
                        if (scrive && perm.modifica(Moduli.DOCUMENTI)) {
                            PulsanteBordo("Prepara la lettera d'incarico", { nav.vai("incarico-lettera/${i.id}") }, Modifier.fillMaxWidth(), icona = Icone.pdf, altezza = 48.dp)
                        }
                    }
                    if (i.stato == "concluso" && i.valutazioneVista.isNotBlank()) Sezione5("Valutazione") {
                        Scheda(orizzontale = 18.dp, verticale = 14.dp, spazio = 6.dp) { Parola6(i.valutazioneVista); if (i.valutazioneNota.isNotBlank()) Text(i.valutazioneNota, style = Testi.secondario, color = c.testo2) }
                    }
                    if (i.cronologia.isNotEmpty() && !sessione.esterno) Sezione5("Cronologia") { Cronologia(i.cronologia) }
                }
            }
        }
        val i = (l as? Lettura.Pronta)?.dato
        if (i != null && scrive) {
            val giallo: Pair<String, () -> Unit>? = when {
                i.stato == "bozza" && perm.costi -> "Affida l'incarico" to { azione("affidaIncarico", fatto = i.numero + " affidato") }
                i.stato == "affidato" && i.modo == "corpo" && i.avanzamento < 100 -> "Aggiorna l'avanzamento" to { foglio = "avanzamento" }
                i.stato == "affidato" -> "Segna concluso" to { azione("concludiIncarico", fatto = i.numero + " concluso") }
                i.stato == "concluso" && i.valutazione.isBlank() -> "Com'è andato?" to { foglio = "valuta" }
                else -> null
            }
            giallo?.let { (t, fai) -> FondoConPulsante(Modifier.align(Alignment.BottomCenter)) { PulsantePrincipale(t, fai, icona = Icone.spunta) } }
        }
    }
    val i = (l as? Lettura.Pronta)?.dato
    if (i != null) when {
        foglio.startsWith("affida:") -> FoglioConferma("Affidi lo stesso?", foglio.removePrefix("affida:"), "Affida lo stesso",
            onConferma = { foglio = ""; azione("affidaIncarico", JSONObject().put("conferma", true), i.numero + " affidato") }, onAnnulla = { foglio = "" })
        foglio == "avanzamento" -> {
            var av by remember { mutableIntStateOf(i.avanzamento) }
            FoglioDalBasso({ foglio = "" }) {
                Text("Aggiorna l'avanzamento", style = Testi.titoloScheda, color = c.testo)
                Text(i.numero + " · " + i.titolo, style = Testi.secondario, color = c.tenue)
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) { Stepper("$av%", { av = (av - 10).coerceAtLeast(0) }, { av = (av + 10).coerceAtMost(100) }, "avanzamento") }
                i.compenso?.let { RigaConto("Maturato", Numeri.euro(Math.round(it * av) / 100.0)) }
                PulsantePrincipale("Salva", { foglio = ""; azione("aggiornaAvanzamento", JSONObject().put("avanzamento", av), "Avanzamento $av%") })
            }
        }
        foglio == "ore" -> FoglioOreCollaboratore(dati, i, { foglio = "" }) { avvisi.mostra("Ore salvate"); Giri6.collaboratori++; giro++ }
        foglio == "collega" -> FoglioCollegaRicevuta(dati, i, { foglio = "" }) { numero -> avvisi.mostra("Fattura $numero collegata a ${i.numero}"); Giri6.collaboratori++; giro++ }
        foglio == "valuta" -> {
            var v by remember { mutableStateOf("bene") }
            var nota by remember { mutableStateOf("") }
            FoglioDalBasso({ foglio = "" }) {
                Text("Com'è andato?", style = Testi.titoloScheda, color = c.testo)
                Text(i.numero + " · " + i.collaboratore, style = Testi.secondario, color = c.tenue)
                SceltePillole(listOf("bene" to "Bene", "problemi" to "Con qualche problema", "male" to "Male"), v, { v = it })
                CampoTesto(nota, { nota = it }, "Nota")
                PulsantePrincipale("Salva", { foglio = ""; azione("valutaIncarico", JSONObject().put("valutazione", v).apply { if (nota.isNotBlank()) put("nota", nota.trim()) }, "Valutato") })
            }
        }
    }
}

/** Le ore di un collaboratore senza accesso a Wisper: le scrive chi segue l'incarico. */
@Composable
private fun FoglioOreCollaboratore(dati: Dati, i: Incarico, onChiudi: () -> Unit, onFatto: () -> Unit) {
    val c = W.colori
    var giorno by remember { mutableStateOf(LocalDate.now()) }
    var ore by remember { mutableStateOf("") }
    var cosa by remember { mutableStateOf("") }
    var errore by remember { mutableStateOf<String?>(null) }
    var inCorso by remember { mutableStateOf(false) }
    var calendario by remember { mutableStateOf(false) }
    FoglioDalBasso(onChiudi) {
        Text("Ore del collaboratore", style = Testi.titoloScheda, color = c.testo)
        Text(i.collaboratore + " · " + i.numero, style = Testi.secondario, color = c.tenue)
        CampoQuando("Il", giornoEsteso(giorno).replaceFirstChar { it.uppercase() }, { calendario = true })
        CampoTesto(ore, { t -> if (t.all { it.isDigit() || it == ',' || it == '.' }) { ore = t; errore = null } }, "Ore", tastiera = KeyboardType.Decimal, suffisso = "ore")
        CampoTesto(cosa, { cosa = it }, "Cosa ha fatto")
        errore?.let { Text(it, style = Testi.secondarioGrande, color = c.rossoTesto) }
        PulsantePrincipale(if (inCorso) "Salvo…" else "Salva le ore", {
            val n = ore.replace(',', '.').toDoubleOrNull()
            if (n == null || n <= 0) { errore = "Ore: scrivi quante"; return@PulsantePrincipale }
            if (inCorso) return@PulsantePrincipale
            inCorso = true
            ambitoFase3.launch {
                dati.fase6.oreCollaboratore(i, giorno, n, cosa.trim())
                    .onSuccess { onChiudi(); onFatto() }
                    .onFailure { errore = spiegaErrore2(it, "Le ore non si sono salvate: riprova") }
                inCorso = false
            }
        })
    }
    if (calendario) FinestraGiorno(giorno, { giorno = it }, { calendario = false })
}

/** Collega una fattura ricevuta: quelle del collaboratore che non hanno ancora un incarico. */
@Composable
private fun FoglioCollegaRicevuta(dati: Dati, i: Incarico, onChiudi: () -> Unit, onFatto: (String) -> Unit) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val l = rememberLettura("ricevute-libere-${i.id}", 0) { dati.fase4.ricevute("tutte") }
    var inCorso by remember { mutableStateOf(false) }
    FoglioDalBasso(onChiudi) {
        Text("Collega una fattura ricevuta", style = Testi.titoloScheda, color = c.testo)
        Text(i.numero + " · " + i.collaboratore, style = Testi.secondario, color = c.tenue)
        when (l) {
            is Lettura.InCorso -> Segnaposto(80.dp)
            is Lettura.Errore -> Text(l.messaggio, style = Testi.secondarioGrande, color = c.testo2)
            is Lettura.Pronta -> {
                val libere = l.dato.filter { it.idFornitore == i.idSoggetto && it.idIncarico.isBlank() && it.stato != "annullata" }
                if (libere.isEmpty()) RigaCalma("Nessuna fattura di ${i.collaboratore} senza incarico.")
                else SchedaElenco {
                    libere.forEachIndexed { n, x ->
                        if (n > 0) LineaElenco()
                        RigaVoce(
                            "Fattura " + x.numero + " · " + dataIt(x.data),
                            sotto = listOfNotNull(x.descrizione.takeIf { it.isNotBlank() }, x.imponibile?.let { "imponibile " + Numeri.euro(it) }).joinToString(" · "),
                            icona = Icone.fatturazione, fine = { Parola6(x.statoVisto) },
                            onClick = {
                                if (!inCorso) {
                                    inCorso = true
                                    ambitoFase3.launch {
                                        dati.fase4.salvaRicevuta(JSONObject().put("id", PonteServer.idJson(x.id)).put("idIncarico", PonteServer.idJson(i.id)))
                                            .onSuccess { onChiudi(); onFatto(x.numero) }
                                            .onFailure { avvisi.mostra(spiegaErrore2(it, "Non si è collegata: riprova")) }
                                        inCorso = false
                                    }
                                }
                            },
                        )
                    }
                }
            }
        }
    }
}

/**
 * La lettera d'incarico (§12.5) dal modello LETTERA_INCARICO: il testo coi dati
 * dell'incarico, da correggere; Salva nell'archivio (giallo) la mette fra le Lettere
 * d'incarico, legata all'incarico e alla commessa.
 */
@Composable
fun SchermataLetteraIncarico(dati: Dati, nav: Navigatore, id: String) {
    val c = W.colori
    val ctx = LocalContext.current
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    val l = rememberLettura("incarico-$id", Giri6.collaboratori * 1000) { dati.fase6.incarico(id) }
    val i = (l as? Lettura.Pronta)?.dato
    var titolo by rememberSaveable { mutableStateOf("") }
    var testo by rememberSaveable { mutableStateOf("") }
    var mancano by remember { mutableStateOf<List<String>>(emptyList()) }
    var lavoro by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(id) {
        if (testo.isNotBlank()) return@LaunchedEffect
        dati.fase5.componi("LETTERA_INCARICO", mapOf("idIncarico" to id))
            .onSuccess { m -> testo = m.testo; titolo = m.titolo; mancano = m.mancano }
            .onFailure { avvisi.mostra(spiegaErrore2(it, "Il testo non si è preparato")) }
    }
    suspend fun pdf(): File {
        val x = i ?: throw IllegalStateException("L'incarico non si è letto: riprova")
        val t = titolo.ifBlank { "Lettera d'incarico " + x.numero }
        val modello = JSONObject().put("titolo", t).put("testo", testo).put("cliente", JSONObject().put("nome", x.collaboratore).put("righe", JSONArray()))
        return Stampa.documentoFase4(ctx, "lettera", modello, paginaLettera(t, testo, ana.ragioneSociale), Stampa.nomeFile("Lettera d'incarico", x.numero), JSONObject(ana.impostazioni))
    }
    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = 150.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Testata(onIndietro = { nav.indietro() }, chiudi = true)
            TitoloPagina("Lettera d'incarico", sopra = i?.let { it.numero + " · " + it.collaboratore })
            CampoTesto(titolo, { titolo = it }, "Titolo")
            CampoTesto(testo, { testo = it }, "Testo", righe = 12)
            val ancora = mancano.filter { testo.contains(it) }
            if (ancora.isNotEmpty()) {
                Text("Manca: " + ancora.joinToString(", ") { it.trim('{', '}').replace('_', ' ') } + ". Scrivilo nella lettera.", style = Testi.forte.copy(fontWeight = FontWeight.Bold), color = c.gialloTesto)
            }
        }
        FondoConPulsante(Modifier.align(Alignment.BottomCenter)) {
            PulsantePrincipale(lavoro ?: "Salva nell'archivio", {
                val x = i
                when {
                    dati.esempio -> avvisi.mostra(SOLO_ESEMPIO)
                    x == null || lavoro != null -> Unit
                    else -> {
                        lavoro = "Salvo…"
                        scope.launch {
                            runCatching {
                                val f = pdf()
                                val cat = dati.fase5.categorie().getOrThrow().firstOrNull { it.nome == "Lettere d'incarico" }?.id.orEmpty()
                                val caricato = dati.fase5.carica(f.name, "application/pdf", f.readBytes()).getOrThrow()
                                val o = JSONObject().put("origine", "file").put("idFile", caricato.id).put("titolo", "Lettera d'incarico " + x.numero)
                                    .put("idIncarico", PonteServer.idJson(x.id)).put("idCommessa", x.idCommessa)
                                if (cat.isNotBlank()) o.put("idCategoria", PonteServer.idJson(cat))
                                dati.fase5.salvaDocumento(o).getOrThrow()
                            }.onSuccess { avvisi.mostra("Lettera salvata nell'archivio"); Giri6.collaboratori++; Giri5.documenti++; nav.indietro() }
                                .onFailure { avvisi.mostra(spiegaErrore2(it, "Non si è salvata: riprova")) }
                            lavoro = null
                        }
                    }
                }
            }, icona = Icone.pdf)
            PulsanteTesto("Apri il PDF", {
                if (lavoro == null) {
                    lavoro = "Preparo il PDF…"
                    scope.launch {
                        runCatching { pdf() }.onSuccess { if (!Stampa.apri(ctx, it)) avvisi.mostra("PDF pronto: ${it.name}") }.onFailure { avvisi.mostra(it.message ?: "Il PDF non si è fatto") }
                        lavoro = null
                    }
                }
            }, Modifier.fillMaxWidth(), colore = c.testo2)
        }
    }
}

// ---------------------------------------------------------------------------------- nuovo incarico, nuovo collaboratore

@Composable
fun SchermataNuovoIncarico(dati: Dati, nav: Navigatore, idSoggetto: String) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    val perm = LocalPermessi.current
    var commessa by rememberSaveable { mutableStateOf("") }
    var titolo by rememberSaveable { mutableStateOf("") }
    var descrizione by rememberSaveable { mutableStateOf("") }
    var modo by rememberSaveable { mutableStateOf("corpo") }
    var compenso by rememberSaveable { mutableStateOf("") }
    var tariffa by rememberSaveable { mutableStateOf("") }
    var ore by rememberSaveable { mutableStateOf("") }
    var spese by rememberSaveable { mutableStateOf(true) }
    var errore by remember { mutableStateOf<String?>(null) }
    var inCorso by remember { mutableStateOf(false) }
    val nome = ana.soggetto(idSoggetto)?.nome ?: idSoggetto
    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = 130.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Testata(onIndietro = { nav.indietro() }, chiudi = true)
            TitoloPagina("Nuovo incarico", sopra = nome)
            Domanda("Commessa") {
                SchedaElenco {
                    ana.commesse.filter { it.aperta }.take(6).forEachIndexed { i, k ->
                        if (i > 0) LineaElenco()
                        RigaVoce(k.descrizione, sotto = ana.clienteDi(k)?.nome, inizio = { CodiceCommessa(k.id) }, fine = { if (commessa == k.id) Parola6("Scelta", colore = ColoreFase5.GIALLO) }, onClick = { commessa = k.id })
                    }
                }
            }
            CampoTesto(titolo, { titolo = it; errore = null }, "Cosa deve fare", segnaposto = "Cablaggio quadri di linea")
            CampoTesto(descrizione, { descrizione = it }, "Descrizione", righe = 2)
            Domanda("Come si paga") { SceltePillole(listOf("corpo" to "A corpo", "ore" to "A ore"), modo, { modo = it }) }
            if (perm.costi) {
                if (modo == "corpo") CampoTesto(compenso, { compenso = it }, "Compenso", tastiera = KeyboardType.Decimal, suffisso = "€")
                else {
                    CampoTesto(tariffa, { tariffa = it }, "Tariffa all'ora", tastiera = KeyboardType.Decimal, suffisso = "€/h")
                    CampoTesto(ore, { ore = it }, "Ore previste", tastiera = KeyboardType.Decimal)
                }
            }
            Domanda("Le spese sono comprese") { SceltePillole(listOf(true to "Sì", false to "No"), spese, { spese = it }) }
            errore?.let { Text(it, style = Testi.secondarioGrande, color = c.rossoTesto) }
        }
        FondoConPulsante(Modifier.align(Alignment.BottomCenter)) {
            PulsantePrincipale(if (inCorso) "Salvo…" else "Salva l'incarico", {
                if (commessa.isBlank()) { errore = "Commessa: scegli la commessa"; return@PulsantePrincipale }
                if (titolo.isBlank()) { errore = "Titolo: scrivi cosa deve fare"; return@PulsantePrincipale }
                if (dati.esempio) { avvisi.mostra(SOLO_ESEMPIO); return@PulsantePrincipale }
                if (inCorso) return@PulsantePrincipale
                inCorso = true
                val o = JSONObject().put("idSoggetto", idSoggetto).put("idCommessa", commessa).put("titolo", titolo.trim()).put("descrizione", descrizione.trim()).put("modo", modo).put("speseComprese", spese)
                importoScritto(compenso)?.let { o.put("compenso", it) }
                importoScritto(tariffa)?.let { o.put("tariffa", it) }
                Numeri.leggi(ore)?.let { o.put("orePreviste", it) }
                ambitoFase3.launch {
                    dati.fase6.salvaIncarico(o).onSuccess { i -> nav.indietro(); nav.vai("incarico/${i.id}"); avvisi.mostra("Incarico " + i.numero + " in bozza"); Giri6.collaboratori++ }
                        .onFailure { errore = spiegaErrore2(it, "L'incarico non si è salvato: riprova") }
                    inCorso = false
                }
            })
        }
    }
}

@Composable
fun SchermataNuovoCollaboratore(dati: Dati, nav: Navigatore) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    val perm = LocalPermessi.current
    var cerca by rememberSaveable { mutableStateOf("") }
    var idFornitore by rememberSaveable { mutableStateOf("") }
    var nome by rememberSaveable { mutableStateOf("") }
    var piva by rememberSaveable { mutableStateOf("") }
    var tipo by rememberSaveable { mutableStateOf("impresa") }
    var mestiere by rememberSaveable { mutableStateOf("") }
    var tariffa by rememberSaveable { mutableStateOf("") }
    var errore by remember { mutableStateOf<String?>(null) }
    var inCorso by remember { mutableStateOf(false) }
    val trovati = if (cerca.length >= 2) ana.fornitori.filter { it.nome.contains(cerca, ignoreCase = true) }.take(5) else emptyList()
    // Cerca la partita IVA (fase 1): il nome e l'indirizzo dal registro, se la partita IVA è attiva.
    var erroreIva by remember { mutableStateOf<String?>(null) }
    var datiIva by remember { mutableStateOf<eu.stgm.wisper.rapportino.DatiPartitaIva?>(null) }
    var cercoIva by remember { mutableStateOf(false) }
    fun cercaIva() {
        val p = piva.trim()
        if (p.isBlank()) { erroreIva = "Scrivi la partita IVA"; return }
        eu.stgm.wisper.rapportino.PartitaIva.errore(p)?.let { erroreIva = it; return }
        if (cercoIva) return
        cercoIva = true
        ambitoFase3.launch {
            dati.controllaPartitaIva(p).onSuccess { d ->
                when {
                    !d.valida -> erroreIva = "Questa partita IVA non risulta attiva"
                    d.nome.isNotBlank() -> { datiIva = d; if (nome.isBlank()) nome = d.nome; avvisi.mostra("Trovata: " + d.nome) }
                    else -> avvisi.mostra("La partita IVA è valida")
                }
            }.onFailure { erroreIva = spiegaErrore2(it, "La partita IVA non si è controllata: riprova") }
            cercoIva = false
        }
    }
    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = 130.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Testata(onIndietro = { nav.indietro() }, chiudi = true)
            TitoloPagina("Nuovo collaboratore")
            Domanda("Chi è") {
                if (idFornitore.isNotBlank()) Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(ana.soggetto(idFornitore)?.nome.orEmpty(), style = Testi.forte, color = c.testo, modifier = Modifier.weight(1f))
                    PulsanteTesto("Cambia", { idFornitore = "" })
                } else {
                    CampoCerca(cerca, { cerca = it }, "Cerca tra i fornitori")
                    if (trovati.isNotEmpty()) SchedaElenco { trovati.forEachIndexed { i, f -> if (i > 0) LineaElenco(); RigaVoce(f.nome, sotto = "Fanne un collaboratore", onClick = { idFornitore = f.id }) } }
                    CampoTesto(nome, { nome = it }, "Oppure: nome")
                    CampoTesto(piva, { piva = it.filter { ch -> ch.isLetterOrDigit() }; erroreIva = null; datiIva = null }, "Partita IVA", tastiera = KeyboardType.Number, errore = erroreIva)
                    PulsanteBordo(if (cercoIva) "Controllo…" else "Cerca la partita IVA", { cercaIva() }, Modifier.fillMaxWidth(), icona = Icone.cerca, altezza = 48.dp)
                }
            }
            Domanda("Tipo") { SceltePillole(listOf("impresa" to "Impresa", "professionista" to "Professionista", "occasionale" to "Occasionale"), tipo, { tipo = it }) }
            CampoTesto(mestiere, { mestiere = it }, "Mestiere", segnaposto = "Impianti elettrici civili e industriali")
            if (perm.costi) CampoTesto(tariffa, { tariffa = it }, "Tariffa proposta", tastiera = KeyboardType.Decimal, suffisso = "€/h")
            errore?.let { Text(it, style = Testi.secondarioGrande, color = c.rossoTesto) }
        }
        FondoConPulsante(Modifier.align(Alignment.BottomCenter)) {
            PulsantePrincipale(if (inCorso) "Salvo…" else "Salva il collaboratore", {
                if (idFornitore.isBlank() && nome.isBlank()) { errore = "Scegli il fornitore o scrivi il nome"; return@PulsantePrincipale }
                if (dati.esempio) { avvisi.mostra(SOLO_ESEMPIO); return@PulsantePrincipale }
                if (inCorso) return@PulsantePrincipale
                inCorso = true
                val o = JSONObject().put("tipo", tipo).put("mestiere", mestiere.trim())
                if (idFornitore.isNotBlank()) o.put("idSoggetto", idFornitore)
                else o.put("soggetto", JSONObject().put("nome", nome.trim()).put("partitaIva", piva).put("fornitore", true).apply {
                    // L'indirizzo trovato con la partita IVA va nella scheda del fornitore.
                    datiIva?.let { d -> put("indirizzo", d.indirizzo).put("cap", d.cap).put("citta", d.citta).put("provincia", d.provincia) }
                })
                importoScritto(tariffa)?.let { o.put("tariffa", it) }
                ambitoFase3.launch {
                    dati.fase6.salvaCollaboratore(o).onSuccess { (k, gia) -> nav.indietro(); nav.vai("collaboratore/${k.idSoggetto}"); avvisi.mostra(if (gia) "C'era già: " + k.nome else "Salvato"); Giri6.collaboratori++ }
                        .onFailure { errore = spiegaErrore2(it, "Non si è salvato: riprova") }
                    inCorso = false
                }
            })
        }
    }
}

// ---------------------------------------------------------------------------------- nella commessa (§8.6)

/** Nella scheda Costi della commessa: "Collaboratori esterni" (con il previsto), "Altre fatture ricevute", e gli incarichi. */
@Composable
internal fun CollaboratoriDellaCommessa(dati: Dati, idCommessa: String) {
    val perm = LocalPermessi.current
    if (dati.esempio || !perm.vede(Moduli.COLLABORATORI) || !perm.costi) return
    val costi = rememberLettura("costi-esterni-$idCommessa", Giri6.collaboratori) { dati.fase6.costiEsterni(idCommessa) }
    val k = (costi as? Lettura.Pronta)?.dato
    if (k != null && (k.collaboratori != null || k.altreRicevute != null)) Scheda(spazio = 8.dp) {
        RigaConto("Collaboratori esterni" + (k.collaboratoriPrevisto?.takeIf { it > 0 }?.let { " · previsto " + Numeri.euro(it) } ?: ""), Numeri.euro(k.collaboratori ?: 0.0))
        RigaConto("Altre fatture ricevute", Numeri.euro(k.altreRicevute ?: 0.0))
    }
}

/** La scheda Incarichi della commessa (§12.8): gli incarichi ai collaboratori esterni, ognuno apre la sua pagina. */
@Composable
internal fun IncarichiDellaCommessa(incarichi: Lettura<List<Incarico>>?, nav: Navigatore) {
    when (incarichi) {
        null -> Unit
        is Lettura.Pronta -> SchedaElenco {
            if (incarichi.dato.isEmpty()) RigaCalma("Nessun incarico su questa commessa.")
            incarichi.dato.forEachIndexed { i, x -> if (i > 0) LineaElenco(); RigaIncarico(x, conCollaboratore = true) { nav.sezione(Sezione.COLLABORATORI); nav.vai("incarico/${x.id}") } }
        }
        is Lettura.Errore -> Text(incarichi.messaggio, style = Testi.secondarioGrande, color = W.colori.testo2)
        else -> Segnaposto(80.dp)
    }
}
