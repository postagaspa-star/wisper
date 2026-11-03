@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package eu.stgm.wisper.ui

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import eu.stgm.wisper.Dati
import eu.stgm.wisper.rapportino.Assenza
import eu.stgm.wisper.rapportino.ColoreFase5
import eu.stgm.wisper.rapportino.ContiPersone
import eu.stgm.wisper.rapportino.InCoda6
import eu.stgm.wisper.rapportino.Moduli
import eu.stgm.wisper.rapportino.Numeri
import eu.stgm.wisper.rapportino.ParolePersone
import eu.stgm.wisper.rapportino.Persona
import eu.stgm.wisper.rapportino.PonteServer
import eu.stgm.wisper.rapportino.Presenze
import eu.stgm.wisper.rapportino.RigaPersona
import eu.stgm.wisper.rapportino.Ruoli
import eu.stgm.wisper.rapportino.Saldo
import eu.stgm.wisper.rapportino.TestiCoda
import eu.stgm.wisper.rapportino.VoceDaApprovare
import eu.stgm.wisper.rapportino.dataDi
import eu.stgm.wisper.rapportino.dataIt
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.time.LocalDate
import java.time.YearMonth
import java.time.format.DateTimeFormatter

/*
 * 10 Persone e risorse umane sul telefono (fase6.md §12.1, prototipo Gestionale-fase6.html):
 * Organico · Ferie e permessi · Presenze · Scadenze · Costi; il collaboratore Io · Ferie e
 * permessi · Organico. Davanti le cose da un minuto (chiedere ferie, il saldo), il resto un
 * livello sotto. I campi che il server non manda non compaiono (Persona: null = non si vede).
 */

enum class SegmentoPersone(val nome: String) { IO("Io"), ORGANICO("Organico"), FERIE("Ferie e permessi"), PRESENZE("Presenze"), SCADENZE("Scadenze"), COSTI("Costi") }

/** Quello che la sezione ricorda fra una pagina e l'altra (e che la Dashboard sceglie). */
object RicordoPersone {
    var segmento by mutableStateOf<SegmentoPersone?>(null)
    var mese: YearMonth = YearMonth.now()

    /** Dalla Dashboard: {segmento: organico | ferie | presenze | scadenze | costi}. */
    fun mostra(segmento: String) {
        this.segmento = when (segmento) {
            "ferie" -> SegmentoPersone.FERIE
            "presenze" -> SegmentoPersone.PRESENZE
            "scadenze" -> SegmentoPersone.SCADENZE
            "costi" -> SegmentoPersone.COSTI
            "organico" -> SegmentoPersone.ORGANICO
            else -> null
        }
    }
}

@Composable
fun SchermataPersone(dati: Dati, nav: Navigatore) {
    val c = W.colori
    val perm = LocalPermessi.current
    val sessione by dati.sessione.collectAsStateWithLifecycle()
    val scrive = perm.modifica(Moduli.PERSONE)
    val conIo = !scrive && sessione.idPersona.isNotBlank()
    val voci = if (conIo) listOf(SegmentoPersone.IO, SegmentoPersone.FERIE, SegmentoPersone.ORGANICO)
    else listOfNotNull(SegmentoPersone.ORGANICO, SegmentoPersone.FERIE, SegmentoPersone.PRESENZE, if (scrive) SegmentoPersone.SCADENZE else null, if (perm.costi) SegmentoPersone.COSTI else null)
    val seg = RicordoPersone.segmento?.takeIf { it in voci } ?: voci.first()
    var costo by remember { mutableStateOf(false) }

    if (seg == SegmentoPersone.IO) {
        SchedaPersona(dati, nav, sessione.idPersona, comeIo = true, segmenti = { SegmentiScorrevoli(voci.map { it to it.nome }, seg, { RicordoPersone.segmento = it }) })
        return
    }
    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).padding(top = 10.dp, bottom = 130.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            TestataInterna({ nav.indietro() })
            TitoloPagina("Persone")
            SegmentiScorrevoli(voci.map { it to it.nome }, seg, { RicordoPersone.segmento = it }, bersagli = { if (it == SegmentoPersone.FERIE) "segmento-ferie" else null })
            when (seg) {
                SegmentoPersone.ORGANICO -> PaginaOrganico(dati, nav)
                SegmentoPersone.FERIE -> PaginaFerie(dati, nav)
                SegmentoPersone.PRESENZE -> PaginaPresenze(dati)
                SegmentoPersone.SCADENZE -> PaginaScadenzePersone(dati, nav)
                SegmentoPersone.COSTI -> PaginaCosti(dati, nav)
                SegmentoPersone.IO -> {}
            }
        }
        val giallo: Pair<String, () -> Unit>? = when (seg) {
            SegmentoPersone.ORGANICO -> if (scrive) "Aggiungi una persona" to { nav.vai("persona-nuova") } else null
            SegmentoPersone.FERIE -> if (sessione.idPersona.isNotBlank() || scrive) "Chiedi ferie o permesso" to { nav.vai("assenza-nuova") } else null
            SegmentoPersone.SCADENZE -> if (scrive && perm.vede(Moduli.DOCUMENTI)) "Nuova scadenza" to { nav.vai("scadenza-nuova") } else null
            SegmentoPersone.COSTI -> if (perm.livello(Moduli.COSTI) >= 2 && scrive) "Nuovo costo" to { costo = true } else null
            else -> null
        }
        giallo?.let { (testo, fai) ->
            FondoConPulsante(Modifier.align(Alignment.BottomCenter)) {
                PulsantePrincipale(testo, fai, Modifier.bersaglio(if (seg == SegmentoPersone.FERIE) "chiedi-ferie" else "giallo-persone"), icona = if (seg == SegmentoPersone.FERIE) Icone.valigia else Icone.piu)
            }
        }
    }
    if (costo) FoglioNuovoCosto(dati, null) { costo = false }
}

// ---------------------------------------------------------------------------------- organico

@Composable
private fun PaginaOrganico(dati: Dati, nav: Navigatore) {
    val perm = LocalPermessi.current
    var giro by remember { mutableIntStateOf(0) }
    var uscite by remember { mutableStateOf(false) }
    val lettura = rememberLettura("organico", giro + Giri6.persone * 1000) { dati.fase6.organico() }
    when (lettura) {
        is Lettura.InCorso -> { Segnaposto(90.dp); Segnaposto(240.dp) }
        is Lettura.Errore -> SchedaErrore(lettura.messaggio) { giro++ }
        is Lettura.Pronta -> {
            val o = lettura.dato
            val scrive = perm.modifica(Moduli.PERSONE)
            if (scrive) RiquadriDue(listOf(
                Triple("${o.attive}", "persone", null),
                Triple("${o.assentiOggi}", "assenti oggi", { RicordoPersone.segmento = SegmentoPersone.FERIE }),
                Triple("${o.senzaAccesso}", "senza accesso", null),
                Triple("${o.daCompletare}", "da completare", null),
            ))
            SchedaElenco {
                if (o.persone.isEmpty()) RigaCalma("Nessuna persona.")
                o.persone.forEachIndexed { i, p ->
                    if (i > 0) LineaElenco()
                    RigaOrganico(p, conPillole = scrive) { nav.vai("persona/${p.id}") }
                }
            }
            if (scrive) {
                SchedaElenco {
                    RigaVoce("Uscite", sotto = if (uscite) null else "Le persone che non lavorano più nello studio", icona = Icone.storia, onClick = { uscite = !uscite })
                }
                if (uscite) {
                    val u = rememberLettura("uscite", giro) { dati.fase6.organico("uscite") }
                    when (u) {
                        is Lettura.Pronta -> SchedaElenco {
                            if (u.dato.persone.isEmpty()) RigaCalma("Nessuna persona uscita.")
                            u.dato.persone.forEachIndexed { i, p -> if (i > 0) LineaElenco(); RigaOrganico(p, conPillole = false) { nav.vai("persona/${p.id}") } }
                        }
                        is Lettura.Errore -> SchedaErrore(u.messaggio) { giro++ }
                        else -> Segnaposto(72.dp)
                    }
                }
            }
        }
    }
}

@Composable
private fun RigaOrganico(p: RigaPersona, conPillole: Boolean, onClick: () -> Unit) {
    val c = W.colori
    Row(
        Modifier.fillMaxWidth().heightIn(min = 68.dp).clickable(onClick = onClick).semantics { role = Role.Button }.padding(vertical = 10.dp),
        verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        CerchioPersona(p.iniziali, 40.dp)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(p.nome, style = Testi.forte, color = c.testo, maxLines = 1, overflow = TextOverflow.Ellipsis)
            val sotto = if (conPillole) listOf(p.ruoloStudio, p.rapportoNome).filter { it.isNotBlank() }.joinToString(" · ")
            else listOf(p.ruoloStudio, p.telefonoLavoro).filter { it.isNotBlank() }.joinToString(" · ")
            if (sotto.isNotBlank()) Text(sotto, style = Testi.secondario.copy(fontWeight = FontWeight.Medium), color = c.tenue, maxLines = 1, overflow = TextOverflow.Ellipsis)
            val assente = p.assenteOggi
            if (assente != null || (conPillole && (p.senzaAccesso || p.daCompletare || p.scadute > 0))) {
                FlowRow(Modifier.padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    if (assente != null) Parola6(assente.tipoVisto + " " + finoA(assente.al), colore = ColoreFase5.GRIGIO)
                    if (conPillole && p.senzaAccesso && p.uscitaIl.isBlank()) Parola6("Senza accesso", colore = ColoreFase5.GRIGIO)
                    if (conPillole && p.daCompletare) Parola6("Da completare")
                    if (conPillole && p.scadute > 0) Parola6(Testo.quanti(p.scadute, "scaduta", "scadute"), colore = ColoreFase5.ROSSO)
                }
            }
        }
        Icon(Icone.freccia, null, tint = c.moltoTenue, modifier = Modifier.padding(top = 10.dp).size(18.dp))
    }
}

// ---------------------------------------------------------------------------------- ferie e permessi

/** Le assenze lette con sopra la coda (le mie richieste ancora sul telefono). */
@Composable
internal fun assenzeConCoda(dati: Dati, lette: List<Assenza>, io: Persona?): List<Assenza> {
    val ops by dati.operazioni.collectAsStateWithLifecycle()
    val sessione by dati.sessione.collectAsStateWithLifecycle()
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    val patrono = ana.impostazione("FESTA_PATRONO")
    val statoSeChiede = if (sessione.interfaccia.approvazione == "nessuno" || (sessione.utente.ruolo == Ruoli.TITOLARE && sessione.interfaccia.approvazione != "tutti")) "approvata" else "da_approvare"
    return remember(lette, ops, io) {
        InCoda6.applicaAssenze(lette, ops) { op ->
            InCoda6.assenzaDaCorpo(op, sessione.idPersona, io?.nome ?: sessione.utente.nome, io?.oreSettimana, io?.giorniSettimana ?: listOf(1, 2, 3, 4, 5), patrono, statoSeChiede)
        }
    }
}

@Composable
private fun PaginaFerie(dati: Dati, nav: Navigatore) {
    val avvisi = LocalAvvisi.current
    val sessione by dati.sessione.collectAsStateWithLifecycle()
    val ops by dati.operazioni.collectAsStateWithLifecycle()
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    val io = sessione.idPersona
    var giro by remember { mutableIntStateOf(0) }
    val giri = giro + Giri6.persone * 1000 + ops.count { it.fase6 } * 7
    val lettura = rememberLettura("assenze", giri) { dati.fase6.assenze() }
    val mia = if (io.isNotBlank()) rememberLettura("io", giri) { dati.fase6.scheda(null) } else null
    val organico = rememberLettura("organico-ferie", giro) { dati.fase6.organico() }
    val chiusure = rememberLettura("chiusure", giro) { dati.fase6.chiusure() }
    var daApprovare by remember { mutableStateOf<List<VoceDaApprovare>>(emptyList()) }
    var aperta by remember { mutableStateOf<Pair<Assenza, VoceDaApprovare?>?>(null) }
    val approva = sessione.puoApprovareAssenze
    if (approva) {
        androidx.compose.runtime.LaunchedEffect(giri) { dati.daApprovare().onSuccess { d -> daApprovare = d.voci.filter { it.tipo == "assenza" } } }
    }

    AvvisoRifiuto(dati)
    TestiCoda.pezziFase6(ops.filter { it.fase6 && !it.rifiutata && (it.tipo == eu.stgm.wisper.rapportino.CodaInvii.Tipo.ASSENZA || it.tipo == eu.stgm.wisper.rapportino.CodaInvii.Tipo.ANNULLA_ASSENZA) })
        .takeIf { it.isNotEmpty() }?.let { p -> PillolaRete(p.joinToString(" e ") { it.second } + if (p.sumOf { it.first } > 1) " partono appena c'è rete" else " parte appena c'è rete") }

    val pers = (mia as? Lettura.Pronta)?.dato
    if (pers != null && !LocalPermessi.current.modifica(Moduli.PERSONE)) {
        SaldoBox(pers.saldi?.ferie, pers.saldi?.permessi, pers.oreGiorno)
    }
    when (lettura) {
        is Lettura.InCorso -> { Segnaposto(160.dp); Segnaposto(120.dp) }
        is Lettura.Errore -> SchedaErrore(lettura.messaggio) { giro++ }
        is Lettura.Pronta -> {
            val e = lettura.dato
            if (e.lettoAl.isNotBlank()) RigaInfo(lettoAlle(e.lettoAl))
            val tutte = assenzeConCoda(dati, e.assenze, pers)
            val persone = (organico as? Lettura.Pronta)?.dato?.persone?.map { it.id to it.nome }
                ?: (tutte.map { it.idPersona to it.persona } + listOfNotNull(pers?.let { it.id to it.nome })).distinctBy { it.first }
            val ch = (chiusure as? Lettura.Pronta)?.dato.orEmpty()
            val oggi = LocalDate.now()
            val festivi = ContiPersone.festiviTra(oggi, oggi.plusDays(30), ana.impostazione("FESTA_PATRONO"))
            Sezione5("Le prossime settimane") { StrisciaAssenze(persone, tutte, ch, festivi) }
            if (approva) {
                val voci = tutte.filter { it.stato == "da_approvare" && it.idPersona != io || (sessione.utente.ruolo == Ruoli.TITOLARE && it.stato == "da_approvare") }
                    .filter { a -> daApprovare.isEmpty() || daApprovare.any { it.id == a.id } }
                if (voci.isNotEmpty()) Sezione5("Da approvare", voci.size) {
                    SchedaElenco {
                        voci.forEachIndexed { i, a ->
                            if (i > 0) LineaElenco()
                            val v = daApprovare.firstOrNull { it.id == a.id }
                            RigaAssenza(a, conPersona = true, sotto = v?.anomalie?.firstOrNull()?.testo ?: v?.dettaglio?.substringAfterLast(" · ")?.takeIf { it.startsWith("restano") }) { aperta = a to v }
                        }
                    }
                }
            }
            val mie = tutte.filter { it.idPersona == io && it.stato != "annullata" || (it.inCoda && it.idPersona == io) }
            if (io.isNotBlank()) Sezione5("Le tue richieste") {
                SchedaElenco {
                    if (mie.isEmpty()) RigaCalma("Nessuna richiesta.")
                    mie.forEachIndexed { i, a ->
                        if (i > 0) LineaElenco()
                        RigaAssenza(a, conPersona = false, onClick = if (a.puoAnnullare && a.stato != "annullata") ({ aperta = a to null }) else null)
                    }
                }
            }
            val prossime = tutte.filter { it.idPersona != io && it.stato == "approvata" && (dataDi(it.al) ?: oggi) >= oggi }
            Sezione5("Prossime") {
                SchedaElenco {
                    if (prossime.isEmpty()) RigaCalma("Nessuno è assente nei prossimi giorni.")
                    prossime.forEachIndexed { i, a -> if (i > 0) LineaElenco(); RigaAssenza(a, conPersona = true) }
                }
            }
            if (ch.isNotEmpty()) Sezione5("Chiusure dello studio") {
                SchedaElenco {
                    ch.forEachIndexed { i, k ->
                        if (i > 0) LineaElenco()
                        RigaVoce(k.frase, sotto = "Dal " + dataIt(k.dal) + " al " + dataIt(k.al) + if (k.ferie) " · ferie per tutti" else "", icona = Icone.calendario)
                    }
                }
            }
        }
    }
    aperta?.let { (a, v) ->
        if (a.idPersona == io && sessione.utente.ruolo != Ruoli.TITOLARE || v == null) FoglioMiaRichiesta(dati, a) { aperta = null; giro++ }
        else FoglioApprova(dati, a, v) { aperta = null; giro++ }
    }
}

/** Una mia richiesta: cosa, quando, lo stato, e Annulla la richiesta finché si può. */
@Composable
private fun FoglioMiaRichiesta(dati: Dati, a: Assenza, onChiudi: () -> Unit) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    FoglioDalBasso(onChiudi) {
        Text(a.tipoVisto, style = Testi.titoloScheda, color = c.testo)
        Text(quandoAssenza(a) + " · " + quantoAssenza(a), style = Testi.testo, color = c.testo2)
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) { Parola6(a.statoVisto); if (a.inCoda) PillolaInCoda() }
        if (!a.nota.isNullOrBlank()) Coppia("Nota per chi approva", a.nota)
        if (a.puoAnnullare && a.stato != "annullata") {
            PulsanteBordo("Annulla la richiesta", {
                scope.launch {
                    dati.fase6.annulla(a).onSuccess { avvisi.mostra(if (a.inCoda && a.id.isBlank()) "Richiesta tolta dal telefono" else "Richiesta annullata"); Giri6.persone++ }
                        .onFailure { avvisi.mostra(spiegaErrore2(it, "Non l'ho annullata: riprova")) }
                    onChiudi()
                }
            }, Modifier.fillMaxWidth(), icona = Icone.chiudi)
        }
        PulsanteTesto("Chiudi", onChiudi, Modifier.fillMaxWidth(), colore = c.testo)
    }
}

/** Approva (foglio, §12.1): persona, cosa, quando, il saldo, le anomalie; giallo Approva, Respingi col bordo; dopo l'avviso con Annulla. */
@Composable
internal fun FoglioApprova(dati: Dati, a: Assenza, v: VoceDaApprovare, onChiudi: () -> Unit) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    var respingi by remember { mutableStateOf(false) }
    var motivo by remember { mutableStateOf("") }
    var errore by remember { mutableStateOf<String?>(null) }
    var inCorso by remember { mutableStateOf(false) }
    FoglioDalBasso(onChiudi) {
        Text(a.tipoVisto + " di " + a.persona, style = Testi.titoloScheda, color = c.testo)
        Text(quandoAssenza(a) + " · " + quantoAssenza(a) + if (a.ore > 0 && a.giorni > 0) " · " + Numeri.scrivi(a.ore) + " ore" else "", style = Testi.testo, color = c.testo2)
        if (v.dettaglio.isNotBlank()) Text(v.dettaglio, style = Testi.secondario, color = c.tenue)
        if (!a.nota.isNullOrBlank()) Coppia("Nota", a.nota)
        v.anomalie.forEach { an -> Text(an.testo, style = Testi.forte.copy(fontWeight = FontWeight.Bold), color = c.gialloTesto) }
        if (respingi) {
            CampoTesto(motivo, { motivo = it; errore = null }, "Motivo", errore = errore, righe = 2)
            PulsantePrincipale(if (inCorso) "Respingo…" else "Respingi", {
                if (motivo.isBlank()) { errore = "Scrivi il motivo: arriva a chi l'ha chiesta"; return@PulsantePrincipale }
                if (inCorso) return@PulsantePrincipale
                inCorso = true
                ambitoFase3.launch {
                    dati.respingi(listOf(v), motivo.trim())
                        .onSuccess { avvisi.mostra("Respinta: ${a.persona} vede il motivo", annulla = { ambitoFase3.launch { dati.annullaApprovazione(listOf(v)); Giri6.persone++ } }); Giri6.persone++ }
                        .onFailure { avvisi.mostra(spiegaErrore2(it, "Non l'ho respinta: riprova")) }
                    inCorso = false
                    onChiudi()
                }
            })
        } else {
            PulsantePrincipale(if (inCorso) "Approvo…" else "Approva", {
                if (inCorso) return@PulsantePrincipale
                inCorso = true
                ambitoFase3.launch {
                    dati.approva(listOf(v))
                        .onSuccess { avvisi.mostra("Approvata", annulla = { ambitoFase3.launch { dati.annullaApprovazione(listOf(v)).onSuccess { Giri6.persone++ } } }); Giri6.persone++ }
                        .onFailure { avvisi.mostra(spiegaErrore2(it, "Non l'ho approvata: riprova")) }
                    inCorso = false
                    onChiudi()
                }
            }, icona = Icone.spunta)
            PulsanteBordo("Respingi", { respingi = true }, Modifier.fillMaxWidth())
        }
    }
}

// ---------------------------------------------------------------------------------- chiedi ferie o permesso

/**
 * Chiedi ferie o permesso (pagina, §12.1): che cosa, quando, il conto grande coi giorni
 * che restano, chi altro è assente, le attività di quei giorni; parte anche senza rete.
 */
@Composable
fun SchermataChiedi(dati: Dati, nav: Navigatore) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    val sessione by dati.sessione.collectAsStateWithLifecycle()
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    val attivita by dati.attivita.collectAsStateWithLifecycle()
    val aggiornamento by dati.aggiornamento.collectAsStateWithLifecycle()
    val scrive = LocalPermessi.current.modifica(Moduli.PERSONE)
    val io = sessione.idPersona
    var perChi by rememberSaveable { mutableStateOf(io) }
    val organico = if (scrive) rememberLettura("organico-chiedi", 0) { dati.fase6.organico() } else null
    val scheda = rememberLettura("scheda-$perChi", 0) { dati.fase6.scheda(perChi.ifBlank { null }) }
    val assenzeL = rememberLettura("assenze-chiedi", 0) { dati.fase6.assenze() }
    val p = (scheda as? Lettura.Pronta)?.dato

    var tipo by rememberSaveable { mutableStateOf("ferie") }
    var altroAperto by rememberSaveable { mutableStateOf(false) }
    var causale by rememberSaveable { mutableStateOf("") }
    val oggi = LocalDate.now()
    val giorniProposti = remember(oggi) { generateSequence(oggi) { it.plusDays(1) }.filter { it.dayOfWeek.value <= 5 }.take(30).toList() }
    var dal by rememberSaveable { mutableStateOf(oggi.toString()) }
    var al by rememberSaveable { mutableStateOf(oggi.toString()) }
    var mezza by rememberSaveable { mutableStateOf("") }
    var dalle by rememberSaveable { mutableStateOf(15 * 60) }
    var alle by rememberSaveable { mutableStateOf(18 * 60) }
    var nota by rememberSaveable { mutableStateOf("") }
    var conNota by rememberSaveable { mutableStateOf(false) }
    var protocollo by rememberSaveable { mutableStateOf("") }
    var conProtocollo by rememberSaveable { mutableStateOf(false) }
    var errore by remember { mutableStateOf<String?>(null) }
    var inCorso by remember { mutableStateOf(false) }

    val aOre = tipo == "permesso"
    val d1 = LocalDate.parse(dal)
    val d2 = if (aOre) d1 else LocalDate.parse(al).let { if (it.isBefore(d1)) d1 else it }
    val festivi = ContiPersone.festiviTra(d1, d2, ana.impostazione("FESTA_PATRONO"))
    fun ora(m: Int) = "%02d:%02d".format(m / 60, m % 60)
    val (giorni, ore) = ContiPersone.oreAssenza(
        ContiPersone.DatiAssenza(tipo, d1, d2, if (tipo == "ferie" && d1 == d2) mezza else "", if (aOre) ora(dalle) else "", if (aOre) ora(alle) else ""),
        p?.oreSettimana, p?.giorniSettimana ?: listOf(1, 2, 3, 4, 5), festivi,
    )
    val saldo: Saldo? = if (tipo == "permesso") p?.saldi?.permessi else p?.saldi?.ferie
    val sanitaria = tipo in ParolePersone.SANITARIE
    val nasceApprovata = sanitaria || (perChi == io && sessione.utente.ruolo == Ruoli.TITOLARE && sessione.interfaccia.approvazione != "tutti") || sessione.interfaccia.approvazione == "nessuno"
    val testoGiallo = when {
        sanitaria && tipo == "malattia" -> "Segnala la malattia"
        sanitaria -> "Segnala l'assenza"
        nasceApprovata -> "Salva"
        else -> "Manda la richiesta"
    }

    fun manda() {
        errore = null
        if (tipo == "altro" && causale.isBlank()) { errore = "Altro: scrivi la causale"; return }
        if (aOre && alle <= dalle) { errore = "Alle: deve venire dopo dalle"; return }
        if (!aOre && giorni == 0.0 && !sanitaria) { errore = "In quei giorni non lavori: niente da chiedere"; return }
        val corpo = JSONObject().put("tipo", tipo).put("dal", d1.toString()).put("al", d2.toString())
        if (tipo == "ferie" && d1 == d2 && mezza.isNotBlank()) corpo.put("mezza", mezza)
        if (aOre) corpo.put("dalle", ora(dalle)).put("alle", ora(alle))
        if (tipo == "altro") corpo.put("causale", causale.trim())
        if (nota.isNotBlank()) corpo.put("nota", nota.trim())
        if (protocollo.isNotBlank()) corpo.put("protocollo", protocollo.trim())
        if (perChi.isNotBlank() && perChi != io) corpo.put("idPersona", PonteServer.idJson(perChi))
        if (dati.esempio) { avvisi.mostra(SOLO_ESEMPIO); return }
        if (perChi == io || perChi.isBlank()) {
            dati.fase6.chiedi(corpo)
            nav.indietro()
            RicordoPersone.segmento = SegmentoPersone.FERIE
            val senzaRete = aggiornamento.errore.isNotBlank()
            avvisi.mostra(when {
                senzaRete -> "Richiesta salvata sul telefono: parte appena c'è rete"
                sanitaria -> "Segnalata: il tipo lo vedono solo il titolare e tu"
                nasceApprovata -> "Salvata"
                else -> "Richiesta mandata: la approva il titolare"
            })
        } else {
            if (inCorso) return
            inCorso = true
            scope.launch {
                dati.fase6.salvaAssenza(corpo)
                    .onSuccess { r -> nav.indietro(); avvisi.mostra(r.anomalie.firstOrNull() ?: "Salvata"); Giri6.persone++ }
                    .onFailure { errore = spiegaErrore2(it, "Non è stata salvata: riprova") }
                inCorso = false
            }
        }
    }

    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = 130.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Testata(onIndietro = { nav.indietro() }, chiudi = true)
            TitoloPagina(if (tipo == "malattia") "Segnala una malattia" else "Chiedi ferie o permesso")
            if (scrive) {
                val persone = (organico as? Lettura.Pronta)?.dato?.persone.orEmpty()
                if (persone.isNotEmpty()) Domanda("Per chi") {
                    SceltePillole(persone.map { it.id to it.nome.substringBefore(' ') }, perChi, { perChi = it })
                }
            }
            Domanda("Che cosa") {
                SceltePillole(listOf("ferie" to "Ferie", "permesso" to "Permesso", "malattia" to "Malattia", "altri" to "Altro"),
                    if (altroAperto) "altri" else tipo, { t -> if (t == "altri") { altroAperto = true; tipo = "altro" } else { altroAperto = false; tipo = t } })
                if (altroAperto) SceltePillole(listOf("altro" to "Altro", "infortunio" to "Infortunio", "congedo" to "Congedo", "legge104" to "Legge 104"), tipo, { tipo = it })
            }
            if (tipo == "altro") CampoTesto(causale, { causale = it; errore = null }, "Causale", segnaposto = "Lutto, studio, donazione di sangue")
            if (aOre) {
                Domanda("Quando") { ScelteGiorni(giorniProposti, d1) { dal = it.toString(); al = it.toString() } }
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text("Dalle", style = Testi.forteGrande, color = c.testo, modifier = Modifier.weight(1f))
                    Stepper(ora(dalle), { dalle = (dalle - 30).coerceAtLeast(0) }, { dalle = (dalle + 30).coerceAtMost(23 * 60 + 30) }, "inizio")
                }
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text("Alle", style = Testi.forteGrande, color = c.testo, modifier = Modifier.weight(1f))
                    Stepper(ora(alle), { alle = (alle - 30).coerceAtLeast(30) }, { alle = (alle + 30).coerceAtMost(24 * 60) }, "fine")
                }
            } else {
                Domanda("Dal") { ScelteGiorni(giorniProposti, d1) { dal = it.toString(); if (LocalDate.parse(al).isBefore(it)) al = it.toString() } }
                Domanda(if (sanitaria) "Fino a quando" else "Al") { ScelteGiorni(giorniProposti.filter { !it.isBefore(d1) }, d2) { al = it.toString() } }
                if (tipo == "ferie" && d1 == d2) Domanda("Mezza giornata") {
                    SceltePillole(listOf("" to "No", "mattina" to "Mattina", "pomeriggio" to "Pomeriggio"), mezza, { mezza = it })
                }
                if (sanitaria) {
                    if (conProtocollo) CampoTesto(protocollo, { protocollo = it }, "Numero del certificato", tastiera = KeyboardType.Number)
                    else PulsanteTesto("+ Numero del certificato", { conProtocollo = true })
                }
            }
            // ---- il conto grande
            Scheda(orizzontale = 18.dp, verticale = 16.dp, spazio = 8.dp) {
                Text(if (aOre) Numeri.scrivi(ore) + " ore" else Numeri.scrivi(giorni) + (if (giorni == 1.0) " giorno" else " giorni") + " · " + Numeri.scrivi(ore) + " ore", style = Testi.numeroGrande, color = c.testo)
                if (saldo?.tenuto == true && (tipo == "ferie" || tipo == "permesso")) {
                    val dopo = saldo.restano - ore
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        if (dopo < 0) Parola6("Sotto zero")
                        Text(
                            if (tipo == "ferie") "Ti restano " + Numeri.scrivi(ContiPersone.giorniDaOre(dopo, p?.oreGiorno ?: 8.0)) + " giorni di ferie" else "Ti restano " + Numeri.scrivi(dopo) + " ore di permesso",
                            style = Testi.forte.copy(fontWeight = FontWeight.Bold), color = if (dopo < 0) c.rossoTesto else c.testo2,
                        )
                    }
                } else if (sanitaria) Text("Il tipo lo vedono solo il titolare e tu", style = Testi.secondario, color = c.tenue)
                // Chi altro è assente e le mie attività in quei giorni: righe calme.
                val altri = (assenzeL as? Lettura.Pronta)?.dato?.assenze.orEmpty().filter { a -> a.idPersona != perChi && a.stato == "approvata" && (dataDi(a.dal) ?: d1) <= d2 && (dataDi(a.al) ?: d2) >= d1 }
                altri.map { it.persona }.distinct().forEach { n -> Text("$n è assente in quei giorni", style = Testi.secondario, color = c.tenue) }
                attivita.filter { at -> at.giorno != null && !at.giorno!!.isBefore(d1) && !at.giorno!!.isAfter(d2) && (at.assegnataA.isBlank() || at.assegnataA == sessione.utente.id) }
                    .take(3).forEach { at -> Text(giornoLungo(at.giorno.toString()).replaceFirstChar { it.uppercase() } + " hai " + at.titolo, style = Testi.secondario, color = c.tenue) }
            }
            if (conNota) CampoTesto(nota, { nota = it }, "Nota per chi approva", righe = 2)
            else PulsanteTesto("+ Una nota per chi approva", { conNota = true })
            errore?.let { Text(it, style = Testi.secondarioGrande, color = c.rossoTesto) }
        }
        FondoConPulsante(Modifier.align(Alignment.BottomCenter)) {
            PulsantePrincipale(if (inCorso) "Salvo…" else testoGiallo, { manda() }, icona = Icone.valigia)
        }
    }
}

/** I giorni come pillole che scorrono di lato: "lun 3". */
@Composable
private fun ScelteGiorni(giorni: List<LocalDate>, scelto: LocalDate, onScelto: (LocalDate) -> Unit) {
    val c = W.colori
    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        giorni.forEach { g ->
            val su = g == scelto
            Column(
                Modifier.width(56.dp).heightIn(min = 60.dp).clip(RoundedCornerShape(14.dp)).background(if (su) c.testo else c.scheda)
                    .clickable { onScelto(g) }.semantics { role = Role.Tab; selected = su }.padding(vertical = 8.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(g.dayOfWeek.getDisplayName(java.time.format.TextStyle.SHORT, ITALIA), style = Testi.piccolo.copy(fontWeight = FontWeight.Bold), color = if (su) c.scheda else c.tenue)
                Text("${g.dayOfMonth}", style = Testi.titoloSezione, color = if (su) c.scheda else c.testo)
            }
        }
    }
}

// ---------------------------------------------------------------------------------- presenze, scadenze, costi

@Composable
private fun PaginaPresenze(dati: Dati) {
    val c = W.colori
    val ctx = LocalContext.current
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    var mese by remember { mutableStateOf(RicordoPersone.mese) }
    var giro by remember { mutableIntStateOf(0) }
    var aperta by remember { mutableStateOf("") }
    val lettura = rememberLettura("presenze-$mese", giro) { dati.fase6.presenze(mese.toString()) }
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        PulsanteTondo(Icone.frecciaSinistra, "Mese prima", { mese = mese.minusMonths(1); RicordoPersone.mese = mese }, dimensione = 48.dp)
        Text(mese.format(DateTimeFormatter.ofPattern("MMMM yyyy", ITALIA)).replaceFirstChar { it.uppercase() }, style = Testi.titoloSezione, color = c.testo, modifier = Modifier.weight(1f), textAlign = TextAlign.Center)
        PulsanteTondo(Icone.freccia, "Mese dopo", { mese = mese.plusMonths(1); RicordoPersone.mese = mese }, dimensione = 48.dp)
    }
    when (lettura) {
        is Lettura.InCorso -> { Segnaposto(90.dp); Segnaposto(90.dp) }
        is Lettura.Errore -> SchedaErrore(lettura.messaggio) { giro++ }
        is Lettura.Pronta -> {
            val pr: Presenze = lettura.dato
            SchedaElenco {
                if (pr.persone.isEmpty()) RigaCalma("Nessuna presenza nel mese.")
                pr.persone.forEachIndexed { i, p ->
                    if (i > 0) LineaElenco()
                    val t = p.totali
                    val nomeMese = mese.format(DateTimeFormatter.ofPattern("MMMM", ITALIA))
                    RigaVoce(
                        p.nome,
                        sotto = "$nomeMese · " + Testo.quanti(t.giorniLavorati, "giorno lavorato", "giorni lavorati") + " · " + Numeri.scrivi(t.oreLavorate) + " ore" +
                            (if (t.mancano > 0) " · mancano " + Numeri.scrivi(t.mancano) + " ore" else ""),
                        inizio = { CerchioPersona(eu.stgm.wisper.rapportino.Utente("", p.nome).iniziali, 40.dp) },
                        onClick = { aperta = if (aperta == p.idPersona) "" else p.idPersona },
                    )
                    if (aperta == p.idPersona) {
                        Column(Modifier.fillMaxWidth().padding(bottom = 10.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            val righe = p.giorni.filter { it.previste > 0 || it.lavorate > 0 || it.assenza.isNotBlank() || it.giorno.isNotBlank() }
                            if (righe.isEmpty()) RigaCalma("Nessun giorno da mostrare.")
                            righe.forEach { g ->
                                Row(Modifier.fillMaxWidth().heightIn(min = 36.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Text(giornoCorto(LocalDate.parse(g.data)), style = Testi.secondario.copy(fontWeight = FontWeight.Bold), color = c.testo2, modifier = Modifier.width(64.dp))
                                    Text(Numeri.scrivi(g.lavorate) + " di " + Numeri.scrivi(g.previste) + " ore", style = Testi.secondario, color = c.testo, modifier = Modifier.weight(1f))
                                    if (g.assenza.isNotBlank()) Parola6(g.assenza)
                                    if (g.giorno == "festa") Parola6("festa", colore = ColoreFase5.GRIGIO)
                                    if (g.giorno == "chiuso") Parola6("chiuso", colore = ColoreFase5.GRIGIO)
                                    if (g.manca > 0) Text("manca " + Numeri.scrivi(g.manca) + if (g.manca == 1.0) " ora" else " ore", style = Testi.secondario.copy(fontWeight = FontWeight.Bold), color = c.gialloTesto)
                                }
                            }
                        }
                    }
                }
            }
            PulsanteBordo("Esporta per il consulente", {
                avvisi.mostra("Preparo il file…")
                scope.launch {
                    dati.fase5.esporta("presenze", listOf("mese" to mese.toString()))
                        .onSuccess { condividiFile(ctx, it, "Le presenze di " + mese.format(DateTimeFormatter.ofPattern("MMMM yyyy", ITALIA)), "text/csv") }
                        .onFailure { avvisi.mostra(spiegaErrore2(it, "Il file non si è preparato: riprova")) }
                }
            }, Modifier.fillMaxWidth(), icona = Icone.scarica)
            RigaNonCollegato("Programma paghe del consulente")
        }
    }
}

@Composable
private fun PaginaScadenzePersone(dati: Dati, nav: Navigatore) {
    var giro by remember { mutableIntStateOf(0) }
    val lettura = rememberLettura("scadenze-persone", giro + Giri6.persone * 1000) { dati.fase5.scadenzeDi(listOf("gruppo" to "persone")) }
    when (lettura) {
        is Lettura.InCorso -> Segnaposto(160.dp)
        is Lettura.Errore -> SchedaErrore(lettura.messaggio) { giro++ }
        is Lettura.Pronta -> {
            val e = lettura.dato
            val tutte = (e.scadute + e.entro + e.piuAvanti).distinctBy { it.id }
            if (tutte.isEmpty()) Scheda(orizzontale = 18.dp, verticale = 16.dp) { RigaCalma("Nessuna scadenza delle persone.") }
            listOf("Scadute" to e.scadute, "Nel preavviso" to e.entro, "Più avanti" to e.piuAvanti).forEach { (nome, l) ->
                if (l.isNotEmpty()) Sezione5(nome, l.size) {
                    SchedaElenco { l.forEachIndexed { i, s -> if (i > 0) LineaElenco(); RigaScadenza(s) { if (s.idPersona.isNotBlank()) nav.vai("persona/${s.idPersona}") else nav.vai("scadenza/${s.id}") } } }
                }
            }
        }
    }
}

@Composable
private fun PaginaCosti(dati: Dati, nav: Navigatore) {
    var giro by remember { mutableIntStateOf(0) }
    val lettura = rememberLettura("organico-costi", giro + Giri6.persone * 1000) { dati.fase6.organico() }
    when (lettura) {
        is Lettura.InCorso -> Segnaposto(200.dp)
        is Lettura.Errore -> SchedaErrore(lettura.messaggio) { giro++ }
        is Lettura.Pronta -> SchedaElenco {
            lettura.dato.persone.forEachIndexed { i, p ->
                if (i > 0) LineaElenco()
                RigaVoce(
                    p.nome,
                    sotto = p.costoOrario?.let { Numeri.euro(it) + " l'ora dal " + dataIt(p.costoDal) },
                    inizio = { CerchioPersona(p.iniziali, 40.dp) },
                    fine = { if (p.costoOrario == null) Parola6("Usa il costo dello studio", colore = ColoreFase5.GRIGIO) },
                    onClick = { nav.vai("persona/${p.id}") },
                )
            }
        }
    }
}

/** Nuovo costo (foglio): persona, dal, costo orario oppure dal costo dell'anno (con `riservati`); poi la frase di conferma. */
@Composable
internal fun FoglioNuovoCosto(dati: Dati, idPersona: String?, onChiudi: () -> Unit) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val sessione by dati.sessione.collectAsStateWithLifecycle()
    val riservati = sessione.vedeRiservati && LocalPermessi.current.livello(Moduli.RISERVATI) >= 2
    val organico = if (idPersona == null) rememberLettura("organico-costo", 0) { dati.fase6.organico() } else null
    var chi by remember { mutableStateOf(idPersona.orEmpty()) }
    var dal by remember { mutableStateOf(LocalDate.now().withDayOfMonth(1)) }
    var dalAnno by remember { mutableStateOf(false) }
    var orario by remember { mutableStateOf("") }
    var anno by remember { mutableStateOf("") }
    var oreAnno by remember { mutableStateOf("") }
    var errore by remember { mutableStateOf<String?>(null) }
    var inCorso by remember { mutableStateOf(false) }
    val proposto = if (dalAnno) importoScritto(anno)?.let { a -> Numeri.leggi(oreAnno)?.let { o -> ContiPersone.costoOrarioDaAnno(a, o) } } else null
    FoglioDalBasso(onChiudi) {
        Text("Nuovo costo", style = Testi.titoloScheda, color = c.testo)
        if (idPersona == null) {
            val persone = (organico as? Lettura.Pronta)?.dato?.persone.orEmpty()
            SceltePillole(persone.map { it.id to it.nome.substringBefore(' ') }, chi, { chi = it })
        }
        PulsanteData("Dal", dal) { dal = it }
        if (riservati) SceltePillole(listOf(false to "Costo orario", true to "Dal costo dell'anno"), dalAnno, { dalAnno = it })
        if (dalAnno) {
            CampoTesto(anno, { anno = it }, "Costo dell'anno", tastiera = KeyboardType.Decimal, suffisso = "€")
            CampoTesto(oreAnno, { oreAnno = it }, "Ore lavorate all'anno", tastiera = KeyboardType.Number)
            if (proposto != null) RigaConto("Costo orario", Numeri.euro(proposto))
        } else CampoTesto(orario, { orario = it }, "Costo orario", tastiera = KeyboardType.Decimal, suffisso = "€/h")
        errore?.let { Text(it, style = Testi.secondario, color = c.rossoTesto) }
        PulsantePrincipale(if (inCorso) "Salvo…" else "Salva il costo", {
            if (chi.isBlank()) { errore = "Scegli la persona"; return@PulsantePrincipale }
            if (inCorso) return@PulsantePrincipale
            inCorso = true
            ambitoFase3.launch {
                dati.fase6.salvaCosto(chi, dal, if (dalAnno) null else importoScritto(orario), if (dalAnno) importoScritto(anno) else null, if (dalAnno) Numeri.leggi(oreAnno) else null, "")
                    .onSuccess { (_, frase) -> avvisi.mostra(frase.ifBlank { "Costo salvato" }); Giri6.persone++; onChiudi() }
                    .onFailure { errore = spiegaErrore2(it, "Il costo non si è salvato: riprova") }
                inCorso = false
            }
        })
    }
}
