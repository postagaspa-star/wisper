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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
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
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import eu.stgm.wisper.Dati
import eu.stgm.wisper.rapportino.ColoreFase5
import eu.stgm.wisper.rapportino.ConsegnaDpi
import eu.stgm.wisper.rapportino.Moduli
import eu.stgm.wisper.rapportino.Numeri
import eu.stgm.wisper.rapportino.ParolePersone
import eu.stgm.wisper.rapportino.Persona
import eu.stgm.wisper.rapportino.PonteServer
import eu.stgm.wisper.rapportino.Ruoli
import eu.stgm.wisper.rapportino.VoceDaApprovare
import eu.stgm.wisper.rapportino.dataIt
import eu.stgm.wisper.rapportino.istanteLocale
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.time.LocalDate
import java.time.format.DateTimeFormatter

/*
 * La scheda della persona (fase6.md §12.1): a sezioni, coi tre livelli di dati. Una
 * sezione c'è solo se il server ha mandato i suoi campi: il collaboratore che apre un
 * collega vede solo il lavoro; Laura non vede CCNL, giudizi e cedolini; la persona vede
 * i suoi dati e i suoi documenti riservati, non il suo costo.
 */

@Composable
fun SchermataPersona(dati: Dati, nav: Navigatore, id: String) {
    SchedaPersona(dati, nav, id, comeIo = false, segmenti = null)
}

@Composable
internal fun SchedaPersona(dati: Dati, nav: Navigatore, id: String, comeIo: Boolean, segmenti: (@Composable () -> Unit)?) {
    val c = W.colori
    val ctx = LocalContext.current
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    val perm = LocalPermessi.current
    val sessione by dati.sessione.collectAsStateWithLifecycle()
    val ops by dati.operazioni.collectAsStateWithLifecycle()
    var giro by remember { mutableIntStateOf(0) }
    val mia = id.isBlank() || id == sessione.idPersona
    val lettura = rememberLettura("persona-$id", giro + Giri6.persone * 1000 + ops.count { it.fase6 } * 7) { dati.fase6.scheda(id.ifBlank { null }) }
    var menu by remember { mutableStateOf(false) }
    var foglio by remember { mutableStateOf("") }
    var apriApprova by remember { mutableStateOf<Pair<eu.stgm.wisper.rapportino.Assenza, VoceDaApprovare>?>(null) }
    var firmaDa by remember { mutableStateOf<ConsegnaDpi?>(null) }
    val scrive = perm.modifica(Moduli.PERSONE)

    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).padding(top = 10.dp, bottom = 130.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            if (comeIo) {
                TestataInterna({ nav.indietro() })
                TitoloPagina("Persone")
                segmenti?.invoke()
            } else TestataInterna({ nav.indietro() }) { if (scrive && !mia) PulsanteTondo(Icone.altro, "Altre azioni", { menu = true }) }
            when (lettura) {
                is Lettura.InCorso -> { Segnaposto(90.dp); Segnaposto(160.dp); Segnaposto(160.dp) }
                is Lettura.Errore -> SchedaErrore(lettura.messaggio) { giro++ }
                is Lettura.Pronta -> CorpoPersona(dati, nav, lettura.dato, mia, onFoglio = { foglio = it }, onFirma = { firmaDa = it }, onApri = { idFile, nome ->
                    scope.launch {
                        avvisi.mostra("Apro il documento…")
                        dati.fase6.fileDaAprire(idFile, nome).onSuccess { f ->
                            if (!eu.stgm.wisper.rapportino.Stampa.apri(ctx, f, mimeDaNome(nome))) avvisi.mostra("Sul telefono non c'è un'app che apre questo file")
                        }.onFailure { avvisi.mostra(spiegaErrore2(it, "Il documento non si apre: riprova")) }
                    }
                })
            }
        }
        val p = (lettura as? Lettura.Pronta)?.dato
        // Il giallo (uno solo): la richiesta da approvare (chi approva); per sé, Chiedi ferie o permesso.
        val daApprovare = p?.assenze?.firstOrNull { it.stato == "da_approvare" && it.daApprovare }
        when {
            p != null && daApprovare != null && sessione.puoApprovareAssenze && !mia -> FondoConPulsante(Modifier.align(Alignment.BottomCenter)) {
                PulsantePrincipale("Approva le ferie", {
                    scope.launch {
                        dati.daApprovare().onSuccess { d ->
                            val v = d.voci.firstOrNull { it.tipo == "assenza" && it.id == daApprovare.id }
                            if (v != null) apriApprova = daApprovare to v else avvisi.mostra("La richiesta non è più da approvare")
                        }.onFailure { avvisi.mostra(spiegaErrore2(it, "Serve la rete per approvare")) }
                    }
                }, icona = Icone.spunta)
            }
            p != null && mia -> FondoConPulsante(Modifier.align(Alignment.BottomCenter)) {
                PulsantePrincipale("Chiedi ferie o permesso", { nav.vai("assenza-nuova") }, Modifier.bersaglio("chiedi-ferie"), icona = Icone.valigia)
            }
        }
    }
    val p = (lettura as? Lettura.Pronta)?.dato
    if (menu && p != null) {
        FoglioDalBasso({ menu = false }) {
            Text(p.nome, style = Testi.titoloScheda, color = c.testo)
            VoceMenu(Icone.matita, "Cambia", { menu = false; nav.vai("persona-modifica/${p.id}") })
            if (sessione.vedeRiservati && sessione.utente.ruolo == Ruoli.TITOLARE) VoceMenu(Icone.occhio, "Chi ha visto i dati riservati", { menu = false; nav.vai("accessi-riservati/${p.id}") })
            if (p.uscitaIl.isBlank()) VoceMenu(Icone.esci, "Segna l'uscita", { menu = false; foglio = "uscita" })
            VoceMenu(Icone.scarica, "Esporta", {
                menu = false
                avvisi.mostra("Preparo il file…")
                scope.launch { dati.fase5.esporta("persone").onSuccess { condividiFile(ctx, it, "Le persone", "text/csv") }.onFailure { avvisi.mostra(spiegaErrore2(it, "Il file non si è preparato: riprova")) } }
            })
        }
    }
    if (p != null) when (foglio) {
        "saldo" -> FoglioSaldo(dati, p) { foglio = ""; giro++ }
        "costo" -> FoglioNuovoCosto(dati, p.id) { foglio = ""; giro++ }
        "uscita" -> FoglioUscita(dati, p) { foglio = ""; giro++ }
        "accesso" -> FoglioDaiAccesso(dati, p) { foglio = ""; giro++ }
        "contatti" -> FoglioContatti(dati, p) { foglio = ""; giro++ }
        "qualifica" -> FoglioQualifica(dati, p) { foglio = ""; giro++ }
    }
    apriApprova?.let { (a, v) -> FoglioApprova(dati, a, v) { apriApprova = null; giro++ } }
    firmaDa?.let { k -> FoglioFirmaDpi(dati, p?.nome.orEmpty(), k) { firmaDa = null; giro++ } }
}

@Composable
private fun CorpoPersona(
    dati: Dati, nav: Navigatore, p: Persona, mia: Boolean,
    onFoglio: (String) -> Unit, onFirma: (ConsegnaDpi) -> Unit, onApri: (String, String) -> Unit,
) {
    val c = W.colori
    val perm = LocalPermessi.current
    val sessione by dati.sessione.collectAsStateWithLifecycle()
    val scrive = perm.modifica(Moduli.PERSONE)
    var personaliAperti by rememberSaveable { mutableStateOf(mia) }

    if (p.lettoAl.isNotBlank()) RigaInfo(lettoAlle(p.lettoAl))
    // ---- testa
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
        CerchioPersona(p.iniziali, 56.dp)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(p.nome, style = Testi.titoloScheda, color = c.testo)
            Text(listOf(p.ruoloStudio, p.rapportoNome).filter { it.isNotBlank() }.joinToString(" · "), style = Testi.secondarioGrande, color = c.tenue)
        }
    }
    val assente = p.assenteOggi
    if (assente != null || (scrive && p.senzaAccesso) || p.uscitaIl.isNotBlank()) {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            if (assente != null) Parola6(assente.tipoVisto + " " + finoA(assente.al), colore = ColoreFase5.GRIGIO)
            if (scrive && p.senzaAccesso && p.uscitaIl.isBlank()) Parola6("Senza accesso", colore = ColoreFase5.GRIGIO)
            if (p.uscitaIl.isNotBlank()) Parola6("Uscita il " + dataIt(p.uscitaIl), colore = ColoreFase5.GRIGIO)
        }
    }
    if (scrive && p.daCompletare.isNotEmpty()) Fascia6(p.daCompletare.joinToString(" · "))

    // ---- lavoro (sempre)
    Sezione5("Lavoro") {
        Scheda(orizzontale = 18.dp, verticale = 12.dp, spazio = 2.dp) {
            if (p.mansione.isNotBlank()) Coppia("Mansione", p.mansione)
            if (p.entrataIl.isNotBlank()) Coppia("Entrata", dataIt(p.entrataIl))
            if (p.oreSettimana != null || p.idUtente.isNotBlank()) Coppia("Orario", Numeri.scrivi(p.oreSettimana ?: (p.oreGiorno * p.giorniSettimana.size)) + " ore su " + p.giorniSettimana.size + " giorni")
            Coppia("Telefono di lavoro", p.telefonoLavoro)
            Coppia("Email di lavoro", p.emailLavoro)
        }
    }

    // ---- ferie e permessi (dati personali: persone 2 e la persona)
    if (p.saldi != null || p.assenze != null) Sezione5("Ferie e permessi") {
        SaldoBox(p.saldi?.ferie, p.saldi?.permessi, p.oreGiorno) {
            if (scrive && !mia) PulsanteBordo("Aggiorna dal cedolino", { onFoglio("saldo") }, altezza = 48.dp)
        }
        val prossime = p.assenze.orEmpty().filter { a -> a.stato != "annullata" && (eu.stgm.wisper.rapportino.dataDi(a.al) ?: LocalDate.MIN) >= LocalDate.now() }
        if (prossime.isNotEmpty()) SchedaElenco { prossime.forEachIndexed { i, a -> if (i > 0) LineaElenco(); RigaAssenza(a, conPersona = false) } }
    }

    // ---- competenze e formazione (lavoro, ma degli altri non per il collaboratore: il server le manda vuote)
    if (p.qualifiche.isNotEmpty() || scrive) Sezione5("Competenze e formazione") {
        SchedaElenco {
            if (p.qualifiche.isEmpty()) RigaCalma("Nessuna competenza scritta.")
            p.qualifiche.forEachIndexed { i, q ->
                if (i > 0) LineaElenco()
                val col = ColoreFase6.di(q.statoVisto)
                RigaVoce(
                    q.nome, sotto = listOf(q.titolo, if (q.data.isNotBlank()) dataIt(q.data) else "").filter { it.isNotBlank() }.joinToString(" · "),
                    inizio = { IconaColorata(if (q.tipo in setOf("pes", "pav", "pei")) Icone.fulmine else Icone.documento, if (col == ColoreFase5.VERDE) ColoreFase5.GRIGIO else col) },
                    fine = { Parola6(q.statoVisto) },
                )
            }
            if (scrive) { LineaElenco(); RigaAzione("Aggiungi", onClick = { onFoglio("qualifica") }) }
        }
    }

    // ---- visite mediche (con `riservati` il giudizio; senza, solo le date)
    val visite = p.visite.orEmpty()
    if (visite.isNotEmpty()) Sezione5("Visite mediche") {
        Scheda(orizzontale = 18.dp, verticale = 14.dp, spazio = 8.dp) {
            visite.forEach { v ->
                if (v.conGiudizio) {
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Visita del " + dataIt(v.data), style = Testi.forte, color = c.testo, modifier = Modifier.weight(1f))
                        v.giudizioVisto?.takeIf { it.isNotBlank() }?.let { Parola6(it) }
                    }
                    if (!v.prescrizioni.isNullOrBlank()) Row(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(c.superficie2).padding(12.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Icon(Icone.lucchetto, null, tint = c.tenue, modifier = Modifier.size(14.dp).semantics { contentDescription = "Riservato" })
                        Text("Prescrizioni: " + v.prescrizioni, style = Testi.secondario, color = c.testo2)
                    }
                    if (v.prossima.isNotBlank()) Text("Prossima visita il " + dataIt(v.prossima), style = Testi.secondario, color = c.tenue)
                } else Text(v.riga, style = Testi.forte, color = c.testo)
            }
            // La riga fissa della pagina (fase6.md §5.4): è una regola, non una frase d'aiuto.
            if (visite.any { it.conGiudizio }) Text("Qui va solo il giudizio del medico, non la diagnosi", style = Testi.piccolo, color = c.tenue)
        }
    }

    // ---- ha in uso: mezzo, strumenti, DPI
    val dpi = p.dpi.orEmpty().filter { it.restituitoIl.isBlank() && it.idAttrezzatura.isBlank() }
    val consegna = (perm.modifica(Moduli.PERSONE) || perm.modifica(Moduli.MEZZI)) && !dati.esempio
    if (p.mezzi.isNotEmpty() || p.attrezzature.isNotEmpty() || dpi.isNotEmpty() || consegna) Sezione5("Ha in uso") {
        SchedaElenco {
            var primo = true
            fun sep() { primo = false }
            p.mezzi.forEach { m ->
                if (!primo) LineaElenco(); sep()
                RigaVoce(m.nome, sotto = "Assegnato dal " + dataIt(m.dal), icona = Icone.mezzo, onClick = { nav.vai("mezzo/${m.id}") })
            }
            p.attrezzature.forEach { a ->
                if (!primo) LineaElenco(); sep()
                RigaVoce(a.nome, sotto = listOf(a.codice, a.taratura).filter { it.isNotBlank() }.joinToString(" · "),
                    inizio = { IconaColorata(iconaAttrezzatura(a.categoria), ColoreFase6.di(a.taratura).takeIf { it == ColoreFase5.ROSSO || it == ColoreFase5.AMBRA } ?: ColoreFase5.GRIGIO) },
                    onClick = { nav.vai("strumento/${a.id}") })
            }
            dpi.forEach { k ->
                if (!primo) LineaElenco(); sep()
                val firmaQui = !k.firmata && (mia || consegna)
                RigaVoce(k.cosa + if (k.taglia.isNotBlank()) " · taglia ${k.taglia}" else "", sotto = "Consegnato il " + dataIt(k.data), icona = Icone.scudo,
                    fine = { if (k.firmata) Parola6("Firmata") else Parola6("Da firmare") }, onClick = if (firmaQui) ({ onFirma(k) }) else null)
            }
            if (consegna) { if (!primo) LineaElenco(); RigaAzione("Consegna un DPI", Icone.scudo) { nav.vai("dpi-consegna/${p.id}") } }
        }
    }

    // ---- documenti personali e riservati (persone 2 e la persona)
    if (p.documenti.isNotEmpty()) Sezione5("Documenti") {
        SchedaElenco {
            p.documenti.forEachIndexed { i, d ->
                if (i > 0) LineaElenco()
                RigaVoce(
                    d.titolo, sotto = d.categoria + if ((d.vede == "riservati")) " · riservato" else "",
                    inizio = { IconaColorata(if ((d.vede == "riservati")) Icone.lucchetto else Icone.documento, if ((d.vede == "riservati")) ColoreFase5.GRIGIO else ColoreFase5.BLU) },
                    onClick = { val idFile = eu.stgm.wisper.rapportino.FileRemoto.idDaUrl(d.url); if (idFile.isNotBlank()) onApri(idFile, d.nomeFile.ifBlank { d.titolo + ".pdf" }) },
                )
            }
        }
    }

    // ---- costo (chi ha i soldi; la persona non vede il suo)
    if (p.costoVisto && !mia) Sezione5("Costo") {
        Scheda(orizzontale = 18.dp, verticale = 14.dp, spazio = 6.dp) {
            if (p.costoOrario != null) Text(Numeri.euro(p.costoOrario) + " l'ora" + (p.costoDal?.takeIf { it.isNotBlank() }?.let { " dal " + dataIt(it) } ?: ""), style = Testi.titoloSezione, color = c.testo)
            else {
                Text("Usa il costo dello studio", style = Testi.forte, color = c.testo)
                Text(if (p.rapporto == "titolare") "Valgono le regole di oggi: cliente, commessa, impostazioni" else "Le sue ore usano il costo dello studio", style = Testi.secondario, color = c.tenue)
            }
            if (p.costoAnno != null) Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Icon(Icone.lucchetto, null, tint = c.tenue, modifier = Modifier.size(14.dp).semantics { contentDescription = "Riservato" })
                Text("Costo dell'anno " + Numeri.euro(p.costoAnno) + (p.oreAnno?.let { " · " + Numeri.scrivi(it) + " ore" } ?: ""), style = Testi.secondario, color = c.testo2)
            }
            if (perm.livello(Moduli.COSTI) >= 2 && scrive) PulsanteBordo("Nuovo costo", { onFoglio("costo") }, altezza = 48.dp, icona = Icone.piu)
        }
    }

    // ---- dati personali (persone 2 o la propria; chiusa di base)
    if (p.conPersonali || p.conRiservati) {
        SchedaElenco {
            RigaVoce("Dati personali", icona = if (personaliAperti) Icone.su else Icone.giu, onClick = { personaliAperti = !personaliAperti }, freccia = false)
            if (personaliAperti) {
                Column(Modifier.fillMaxWidth().padding(bottom = 12.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Coppia("Codice fiscale", p.codiceFiscale)
                    p.nascitaData?.takeIf { it.isNotBlank() }?.let { Coppia("Nato il", dataIt(it) + (p.nascitaLuogo?.takeIf { l -> l.isNotBlank() }?.let { l -> " a $l" } ?: "")) }
                    val indirizzo = listOfNotNull(p.indirizzo, listOfNotNull(p.cap, p.citta).joinToString(" ").trim(), p.provincia?.takeIf { it.isNotBlank() }?.let { "($it)" }).filter { it.isNotBlank() }.joinToString(" ")
                    if (p.indirizzo != null) Coppia("Indirizzo", indirizzo)
                    Coppia("Telefono personale", p.telefonoPersonale)
                    Coppia("Email personale", p.emailPersonale)
                    Coppia("IBAN per i rimborsi", p.iban?.let { if (it.length > 8) "…" + it.takeLast(4) else it })
                    if (p.emergenzaNome != null) Coppia("Contatto di emergenza", listOfNotNull(p.emergenzaNome, p.emergenzaTelefono).filter { it.isNotBlank() }.joinToString(" · "))
                    p.contrattoTipo?.let { t -> Coppia("Contratto", t.replace('_', ' ').replaceFirstChar { it.uppercase() } + (p.contrattoScade?.takeIf { it.isNotBlank() }?.let { " · finisce il " + dataIt(it) } ?: "")) }
                    if (p.ccnl != null || p.livello != null) Coppia("CCNL e livello", listOfNotNull(p.ccnl, p.livello).filter { it.isNotBlank() }.joinToString(" · "), riservato = true)
                    p.noteRiservate?.takeIf { it.isNotBlank() }?.let { Coppia("Note riservate", it, riservato = true) }
                    if (p.puoCambiareContatti && mia) PulsanteBordo("Cambia i tuoi contatti", { onFoglio("contatti") }, Modifier.padding(top = 8.dp), altezza = 48.dp, icona = Icone.matita)
                }
            }
        }
    }

    // ---- accesso a Wisper (chi scrive le persone)
    if (scrive && !mia) Sezione5("Accesso a Wisper") {
        Scheda(orizzontale = 18.dp, verticale = 14.dp, spazio = 4.dp) {
            if (p.idUtente.isNotBlank()) {
                Coppia("Ruolo", Ruoli.nome(p.ruoloWisper))
                Coppia("Ultimo accesso", istanteLocale(p.ultimoAccesso)?.format(DateTimeFormatter.ofPattern("dd/MM/yyyy H:mm")) ?: "mai")
                if (!p.accessoAttivo) Parola6("Accesso tolto", colore = ColoreFase5.GRIGIO)
            } else {
                Text("Non entra in Wisper.", style = Testi.secondario, color = c.tenue)
                if (perm.modifica(Moduli.AMMINISTRAZIONE)) PulsanteBordo("Dai l'accesso a Wisper", { onFoglio("accesso") }, altezza = 48.dp, icona = Icone.esci)
            }
        }
    }
    if (p.programmaPaghe.isNotBlank() && scrive && !mia) RigaNonCollegato("Programma paghe del consulente")
}

// ---------------------------------------------------------------------------------- fogli della scheda

@Composable
private fun FoglioSaldo(dati: Dati, p: Persona, onChiudi: () -> Unit) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    var data by remember { mutableStateOf(LocalDate.now().withDayOfMonth(1).minusDays(1)) }
    var ferie by remember { mutableStateOf(p.saldi?.ferie?.takeIf { it.tenuto }?.scritto?.let { Numeri.scrivi(it) }.orEmpty()) }
    var permessi by remember { mutableStateOf(p.saldi?.permessi?.takeIf { it.tenuto }?.scritto?.let { Numeri.scrivi(it) }.orEmpty()) }
    var errore by remember { mutableStateOf<String?>(null) }
    var inCorso by remember { mutableStateOf(false) }
    FoglioDalBasso(onChiudi) {
        Text("Aggiorna dal cedolino", style = Testi.titoloScheda, color = c.testo)
        Text(p.nome, style = Testi.secondarioGrande, color = c.tenue)
        PulsanteData("Il residuo è al", data) { data = it }
        CampoTesto(ferie, { ferie = it }, "Ferie che restano", tastiera = KeyboardType.Decimal, suffisso = "ore")
        CampoTesto(permessi, { permessi = it }, "Permessi che restano", tastiera = KeyboardType.Decimal, suffisso = "ore")
        errore?.let { Text(it, style = Testi.secondario, color = c.rossoTesto) }
        PulsantePrincipale(if (inCorso) "Salvo…" else "Salva il saldo", {
            val f = Numeri.leggi(ferie)
            val pm = Numeri.leggi(permessi)
            if (f == null && pm == null) { errore = "Ore: scrivi il residuo del cedolino in ore"; return@PulsantePrincipale }
            if (inCorso) return@PulsantePrincipale
            inCorso = true
            ambitoFase3.launch {
                val nota = "Cedolino di " + data.format(DateTimeFormatter.ofPattern("MMMM", ITALIA))
                var ok = true
                if (f != null) dati.fase6.salvaSaldo(p.id, "ferie", data, f, nota).onFailure { ok = false; errore = spiegaErrore2(it, "Il saldo non si è salvato: riprova") }
                if (ok && pm != null) dati.fase6.salvaSaldo(p.id, "permessi", data, pm, nota).onFailure { ok = false; errore = spiegaErrore2(it, "Il saldo non si è salvato: riprova") }
                inCorso = false
                if (ok) { avvisi.mostra("Saldo salvato: Wisper conta da qui"); Giri6.persone++; onChiudi() }
            }
        })
    }
}

@Composable
private fun FoglioUscita(dati: Dati, p: Persona, onChiudi: () -> Unit) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    var data by remember { mutableStateOf(LocalDate.now()) }
    var motivo by remember { mutableStateOf("") }
    var frase by remember { mutableStateOf<String?>(null) }
    var cosa by remember { mutableStateOf<List<String>>(emptyList()) }
    var errore by remember { mutableStateOf<String?>(null) }
    var inCorso by remember { mutableStateOf(false) }
    fun manda(conferma: Boolean) {
        if (inCorso) return
        inCorso = true
        ambitoFase3.launch {
            dati.fase6.segnaUscita(p.id, data, motivo, conferma)
                .onSuccess { avvisi.mostra("Uscita segnata: " + p.nome + " esce il " + dataIt(data.toString())); Giri6.persone++; onChiudi() }
                .onFailure { e ->
                    val dc = daConfermare(e)
                    if (dc != null) {
                        val r = dc.risposta
                        val f = r.optJSONObject("daFare")
                        frase = r.optString("frase", dc.message.orEmpty())
                        cosa = buildList {
                            f?.optString("accesso")?.takeIf { it.isNotBlank() }?.let { add(it) }
                            f?.optJSONArray("daRestituire")?.let { a -> if (a.length() > 0) add("Da restituire: " + (0 until a.length()).joinToString(", ") { a.optJSONObject(it).optString("nome") }) }
                            f?.optInt("assenzeFuture")?.takeIf { it > 0 }?.let { add(Testo.quanti(it, "assenza futura si annulla", "assenze future si annullano")) }
                            f?.optInt("ticketInCarico")?.takeIf { it > 0 }?.let { add(Testo.quanti(it, "ticket torna aperto", "ticket tornano aperti")) }
                            f?.optInt("scadenzeAperte")?.takeIf { it > 0 }?.let { add(Testo.quanti(it, "scadenza si annulla", "scadenze si annullano")) }
                            f?.optJSONArray("contattiTolti")?.let { a -> if (a.length() > 0) add("Si tolgono subito: " + (0 until a.length()).joinToString(" e ") { a.optString(it) }) }
                        }
                    } else errore = spiegaErrore2(e, "L'uscita non si è salvata: riprova")
                }
            inCorso = false
        }
    }
    FoglioDalBasso(onChiudi) {
        Text("Segna l'uscita di " + p.nome, style = Testi.titoloScheda, color = c.testo)
        PulsanteData("Ultimo giorno", data) { data = it; frase = null }
        CampoTesto(motivo, { motivo = it }, "Motivo", segnaposto = "Dimissioni, fine del tirocinio")
        if (frase != null) Scheda(orizzontale = 16.dp, verticale = 12.dp, spazio = 6.dp) {
            Text(frase!!, style = Testi.forte, color = c.testo)
            cosa.forEach { Text(it, style = Testi.secondario, color = c.testo2) }
        }
        errore?.let { Text(it, style = Testi.secondario, color = c.rossoTesto) }
        PulsantePrincipale(if (inCorso) "Salvo…" else "Segna l'uscita", { manda(conferma = frase != null) }, icona = Icone.esci)
    }
}

@Composable
private fun FoglioDaiAccesso(dati: Dati, p: Persona, onChiudi: () -> Unit) {
    val c = W.colori
    var email by remember { mutableStateOf(p.emailLavoro) }
    var ruolo by remember { mutableStateOf(Ruoli.COLLABORATORE) }
    var password by remember { mutableStateOf<String?>(null) }
    var errore by remember { mutableStateOf<String?>(null) }
    var inCorso by remember { mutableStateOf(false) }
    FoglioDalBasso(onChiudi) {
        Text("Dai l'accesso a Wisper", style = Testi.titoloScheda, color = c.testo)
        Text(p.nome, style = Testi.secondarioGrande, color = c.tenue)
        val pw = password
        if (pw != null) {
            Text("Password iniziale: $pw", style = Testi.titoloSezione, color = c.testo)
            Text("Si vede solo adesso: dalla a ${p.nome.substringBefore(' ')}. Al primo accesso la cambia.", style = Testi.secondario, color = c.testo2)
            PulsanteBordo("Fatto", onChiudi, Modifier.fillMaxWidth())
        } else {
            CampoTesto(email, { email = it }, "Email", tastiera = KeyboardType.Email)
            SceltePillole(listOf(Ruoli.COLLABORATORE to "Collaboratore", Ruoli.LETTURA to "Lettura", Ruoli.AMMINISTRAZIONE to "Amministrazione"), ruolo, { ruolo = it })
            errore?.let { Text(it, style = Testi.secondario, color = c.rossoTesto) }
            PulsantePrincipale(if (inCorso) "Creo…" else "Crea l'accesso", {
                if (inCorso) return@PulsantePrincipale
                inCorso = true
                ambitoFase3.launch {
                    dati.fase6.daiAccesso(p.id, email, ruolo).onSuccess { password = it.ifBlank { "—" }; Giri6.persone++ }.onFailure { errore = spiegaErrore2(it, "L'accesso non è stato creato: riprova") }
                    inCorso = false
                }
            })
        }
    }
}

/** "Cambia i tuoi contatti": telefono ed email personali, indirizzo, IBAN, contatto di emergenza (§5.1). */
@Composable
private fun FoglioContatti(dati: Dati, p: Persona, onChiudi: () -> Unit) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    var tel by remember { mutableStateOf(p.telefonoPersonale.orEmpty()) }
    var email by remember { mutableStateOf(p.emailPersonale.orEmpty()) }
    var indirizzo by remember { mutableStateOf(p.indirizzo.orEmpty()) }
    var cap by remember { mutableStateOf(p.cap.orEmpty()) }
    var citta by remember { mutableStateOf(p.citta.orEmpty()) }
    var iban by remember { mutableStateOf(p.iban.orEmpty()) }
    var emNome by remember { mutableStateOf(p.emergenzaNome.orEmpty()) }
    var emTel by remember { mutableStateOf(p.emergenzaTelefono.orEmpty()) }
    var errore by remember { mutableStateOf<String?>(null) }
    var inCorso by remember { mutableStateOf(false) }
    FoglioDalBasso(onChiudi) {
        Text("I tuoi contatti", style = Testi.titoloScheda, color = c.testo)
        Column(Modifier.heightIn(max = 520.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            CampoTesto(tel, { tel = it }, "Telefono personale", tastiera = KeyboardType.Phone)
            CampoTesto(email, { email = it }, "Email personale", tastiera = KeyboardType.Email)
            CampoTesto(indirizzo, { indirizzo = it }, "Indirizzo")
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                CampoTesto(cap, { cap = it }, "CAP", Modifier.weight(1f), tastiera = KeyboardType.Number)
                CampoTesto(citta, { citta = it }, "Città", Modifier.weight(2f))
            }
            CampoTesto(iban, { iban = it }, "IBAN per i rimborsi")
            CampoTesto(emNome, { emNome = it }, "Contatto di emergenza")
            CampoTesto(emTel, { emTel = it }, "Telefono di emergenza", tastiera = KeyboardType.Phone)
        }
        errore?.let { Text(it, style = Testi.secondario, color = c.rossoTesto) }
        PulsantePrincipale(if (inCorso) "Salvo…" else "Salva i contatti", {
            if (inCorso) return@PulsantePrincipale
            inCorso = true
            val o = JSONObject().put("id", PonteServer.idJson(p.id)).put("nome", p.nome).put("telefonoPersonale", tel.trim()).put("emailPersonale", email.trim())
                .put("indirizzo", indirizzo.trim()).put("cap", cap.trim()).put("citta", citta.trim()).put("iban", iban.replace(" ", "").uppercase())
                .put("emergenzaNome", emNome.trim()).put("emergenzaTelefono", emTel.trim())
            ambitoFase3.launch {
                dati.fase6.salvaPersona(o).onSuccess { avvisi.mostra("Contatti salvati"); Giri6.persone++; onChiudi() }.onFailure { errore = spiegaErrore2(it, "I contatti non si sono salvati: riprova") }
                inCorso = false
            }
        })
    }
}

/** Aggiungi una competenza o una formazione (§5.3): il tipo a pillole, la data, la scadenza proposta dal server. */
@Composable
private fun FoglioQualifica(dati: Dati, p: Persona, onChiudi: () -> Unit) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val tipi = rememberLettura("qualificheTipi", 0) { dati.fase6.qualificheTipi() }
    var tipo by remember { mutableStateOf("") }
    var titolo by remember { mutableStateOf("") }
    var data by remember { mutableStateOf(LocalDate.now()) }
    var errore by remember { mutableStateOf<String?>(null) }
    var inCorso by remember { mutableStateOf(false) }
    FoglioDalBasso(onChiudi) {
        Text("Competenza o formazione", style = Testi.titoloScheda, color = c.testo)
        val l = (tipi as? Lettura.Pronta)?.dato.orEmpty().filter { it.attivo }
        if (l.isEmpty() && tipi is Lettura.InCorso) Segnaposto(90.dp)
        SceltePillole(l.map { it.chiave to it.nome.substringBefore(" · ").substringBefore(" (") }, tipo, { tipo = it })
        CampoTesto(titolo, { titolo = it }, "Dettaglio", segnaposto = "Livelli 1A e 1B, 16 ore")
        PulsanteData("Data", data) { data = it }
        errore?.let { Text(it, style = Testi.secondario, color = c.rossoTesto) }
        PulsantePrincipale(if (inCorso) "Salvo…" else "Salva", {
            if (tipo.isBlank()) { errore = "Scegli il tipo"; return@PulsantePrincipale }
            if (inCorso) return@PulsantePrincipale
            inCorso = true
            ambitoFase3.launch {
                dati.fase6.salvaQualifica(JSONObject().put("idPersona", PonteServer.idJson(p.id)).put("tipo", tipo).put("titolo", titolo.trim()).put("data", data.toString()))
                    .onSuccess { q -> avvisi.mostra(q.nome + ": " + q.statoVisto.lowercase()); Giri6.persone++; onChiudi() }
                    .onFailure { errore = spiegaErrore2(it, "Non si è salvata: riprova") }
                inCorso = false
            }
        })
    }
}

/** La firma della consegna dal telefono della persona (anche dopo, anche senza rete): in coda. */
@Composable
private fun FoglioFirmaDpi(dati: Dati, nome: String, k: ConsegnaDpi, onChiudi: () -> Unit) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val stato = remember { StatoFirma() }
    FoglioDalBasso(onChiudi) {
        Text("Firma la consegna", style = Testi.titoloScheda, color = c.testo)
        Text(k.cosa + " · " + dataIt(k.data), style = Testi.secondarioGrande, color = c.tenue)
        RiquadroFirma(stato, "Ricevuto da " + nome.ifBlank { "me" } + " · " + k.cosa + " · " + dataIt(LocalDate.now().toString()), Modifier.height(240.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            PulsanteBordo("Cancella", { stato.tratti.clear() }, Modifier.weight(1f), altezza = 64.dp)
            PulsantePrincipale("Conferma la firma", {
                if (!stato.pronta) { avvisi.mostra("Firma vuota: firma di nuovo"); return@PulsantePrincipale }
                if (dati.esempio) { avvisi.mostra(SOLO_ESEMPIO); onChiudi(); return@PulsantePrincipale }
                dati.fase6.firmaDpi(k.id, stato.png())
                avvisi.mostra("Firmata: parte appena c'è rete")
                onChiudi()
            }, Modifier.weight(1.6f), icona = Icone.spunta, abilitato = stato.pronta)
        }
    }
}

// ---------------------------------------------------------------------------------- pagine

/** Consegna DPI (§5.5): cosa, taglia, quanti, data, poi la firma su bianco; o "Firma dopo, dal suo telefono". */
@Composable
fun SchermataConsegnaDpi(dati: Dati, nav: Navigatore, idPersona: String) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val scheda = rememberLettura("persona-dpi-$idPersona", 0) { dati.fase6.scheda(idPersona) }
    val nome = (scheda as? Lettura.Pronta)?.dato?.nome.orEmpty()
    var cosa by rememberSaveable { mutableStateOf("Guanti isolanti") }
    var altro by rememberSaveable { mutableStateOf("") }
    var taglia by rememberSaveable { mutableStateOf("") }
    var quanti by rememberSaveable { mutableStateOf(1) }
    var data by remember { mutableStateOf(LocalDate.now()) }
    val firma = remember { StatoFirma() }
    var errore by remember { mutableStateOf<String?>(null) }
    var inCorso by remember { mutableStateOf(false) }
    val cosaVera = if (cosa == "Altro") altro.trim() else cosa
    fun salva(conFirma: Boolean) {
        if (cosaVera.isBlank()) { errore = "Scrivi cosa consegni"; return }
        if (conFirma && !firma.pronta) { errore = "Firma vuota: firma di nuovo"; return }
        if (dati.esempio) { avvisi.mostra(SOLO_ESEMPIO); return }
        if (inCorso) return
        inCorso = true
        ambitoFase3.launch {
            val o = JSONObject().put("idPersona", PonteServer.idJson(idPersona)).put("cosa", cosaVera).put("quantita", quanti).put("data", data.toString())
            if (taglia.isNotBlank()) o.put("taglia", taglia.trim())
            dati.fase6.salvaConsegnaDpi(o, if (conFirma) firma.png() else null)
                .onSuccess { nav.indietro(); avvisi.mostra(if (conFirma) "Consegna firmata" else "Consegna salvata: la firma la fa dal suo telefono"); Giri6.persone++ }
                .onFailure { errore = spiegaErrore2(it, "La consegna non si è salvata: riprova") }
            inCorso = false
        }
    }
    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = 180.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Testata(onIndietro = { nav.indietro() }, chiudi = true)
            TitoloPagina("Consegna un DPI", sopra = nome.ifBlank { null })
            Domanda("Cosa") { SceltePillole(ParolePersone.PROPOSTE_DPI.map { it to it }, cosa, { cosa = it }) }
            if (cosa == "Altro") CampoTesto(altro, { altro = it }, "Che cosa")
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.Bottom) {
                CampoTesto(taglia, { taglia = it }, "Taglia", Modifier.weight(1f))
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("Quanti", style = Testi.secondarioGrande.copy(fontWeight = FontWeight.Bold), color = c.testo)
                    Stepper("$quanti", { quanti = (quanti - 1).coerceAtLeast(1) }, { quanti++ }, "pezzi")
                }
            }
            PulsanteData("Data", data) { data = it }
            RiquadroFirma(firma, "Ricevuto da " + nome + " · " + cosaVera.lowercase() + " · " + dataIt(data.toString()), Modifier.height(240.dp))
            errore?.let { Text(it, style = Testi.secondarioGrande, color = c.rossoTesto) }
        }
        FondoConPulsante(Modifier.align(Alignment.BottomCenter)) {
            PulsantePrincipale(if (inCorso) "Salvo…" else "Conferma la firma", { salva(true) }, icona = Icone.spunta)
            PulsanteTesto("Firma dopo, dal suo telefono", { salva(false) }, Modifier.fillMaxWidth(), colore = c.testo)
        }
    }
}

/** Chi ha visto i dati riservati (pagina): righe con la frase, chi, quando, da dove. Nessun giallo. */
@Composable
fun SchermataAccessiRiservati(dati: Dati, nav: Navigatore, idPersona: String) {
    val c = W.colori
    var giro by remember { mutableIntStateOf(0) }
    val lettura = rememberLettura("accessi-$idPersona", giro) { dati.fase6.accessiRiservati(idPersona) }
    Column(
        Modifier.fillMaxSize().background(c.fondo).verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = 40.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Testata(onIndietro = { nav.indietro() })
        TitoloPagina("Chi ha visto i dati riservati")
        when (lettura) {
            is Lettura.InCorso -> Segnaposto(200.dp)
            is Lettura.Errore -> SchedaErrore(lettura.messaggio) { giro++ }
            is Lettura.Pronta -> SchedaElenco {
                if (lettura.dato.isEmpty()) RigaCalma("Nessuno ha aperto i dati riservati.")
                lettura.dato.forEachIndexed { i, r ->
                    if (i > 0) LineaElenco()
                    RigaVoce(r.utente + " · " + r.frase, sotto = quandoCorto(r.quando) + if (r.disp.isNotBlank()) " · " + r.disp else "",
                        inizio = { CerchioPersona(eu.stgm.wisper.rapportino.Utente("", r.utente).iniziali, 36.dp) })
                }
            }
        }
    }
}

/** Aggiungi una persona o cambia la scheda (§12.1): nome, rapporto, ruolo, mansione, entrata, contatti di lavoro, orario. */
@Composable
fun SchermataModificaPersona(dati: Dati, nav: Navigatore, id: String?) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val esistente = if (id != null) (rememberLettura("persona-mod-$id", 0) { dati.fase6.scheda(id) } as? Lettura.Pronta)?.dato else null
    if (id != null && esistente == null) {
        Column(Modifier.fillMaxSize().background(c.fondo).padding(MarginePagina), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Testata(onIndietro = { nav.indietro() }, chiudi = true); Segnaposto(240.dp)
        }
        return
    }
    var nome by rememberSaveable(esistente?.id) { mutableStateOf(esistente?.nome.orEmpty()) }
    var rapporto by rememberSaveable(esistente?.id) { mutableStateOf(esistente?.rapporto.orEmpty()) }
    var ruolo by rememberSaveable(esistente?.id) { mutableStateOf(esistente?.ruoloStudio.orEmpty()) }
    var mansione by rememberSaveable(esistente?.id) { mutableStateOf(esistente?.mansione.orEmpty()) }
    var entrata by remember(esistente?.id) { mutableStateOf(esistente?.entrataIl?.let { eu.stgm.wisper.rapportino.dataDi(it) } ?: LocalDate.now()) }
    var tel by rememberSaveable(esistente?.id) { mutableStateOf(esistente?.telefonoLavoro.orEmpty()) }
    var email by rememberSaveable(esistente?.id) { mutableStateOf(esistente?.emailLavoro.orEmpty()) }
    var oreSett by rememberSaveable(esistente?.id) { mutableStateOf(Numeri.scrivi(esistente?.oreSettimana ?: 40.0)) }
    var contatti by rememberSaveable { mutableStateOf(esistente != null) }
    var orario by rememberSaveable { mutableStateOf(esistente != null) }
    var errore by remember { mutableStateOf<String?>(null) }
    var inCorso by remember { mutableStateOf(false) }
    fun salva() {
        errore = null
        if (nome.isBlank()) { errore = "Nome: scrivi il nome"; return }
        val ore = Numeri.leggi(oreSett)
        if (ore == null || ore < 1 || ore > 60) { errore = "Ore alla settimana: da 1 a 60"; return }
        if (dati.esempio) { avvisi.mostra(SOLO_ESEMPIO); return }
        if (inCorso) return
        inCorso = true
        val o = JSONObject().put("nome", nome.trim()).put("rapporto", rapporto).put("ruoloStudio", ruolo.trim()).put("mansione", mansione.trim())
            .put("entrataIl", entrata.toString()).put("telefonoLavoro", tel.trim()).put("emailLavoro", email.trim()).put("oreSettimana", ore)
        if (esistente != null) o.put("id", PonteServer.idJson(esistente.id))
        ambitoFase3.launch {
            dati.fase6.salvaPersona(o)
                .onSuccess { p -> nav.indietro(); if (esistente == null) nav.vai("persona/${p.id}"); avvisi.mostra("Salvata"); Giri6.persone++ }
                .onFailure { errore = spiegaErrore2(it, "Non si è salvata: riprova") }
            inCorso = false
        }
    }
    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = 130.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Testata(onIndietro = { nav.indietro() }, chiudi = true)
            TitoloPagina(if (esistente == null) "Aggiungi una persona" else esistente.nome)
            CampoTesto(nome, { nome = it; errore = null }, "Nome")
            Domanda("Rapporto") { SceltePillole(ParolePersone.RAPPORTI.entries.map { it.key to it.value }, rapporto, { rapporto = it }) }
            CampoTesto(ruolo, { ruolo = it }, "Ruolo nello studio", segnaposto = "Tecnico elettrico")
            CampoTesto(mansione, { mansione = it }, "Mansione", segnaposto = "Lavori elettrici fuori tensione", righe = 2)
            PulsanteData("Entrata", entrata) { entrata = it }
            if (contatti) {
                CampoTesto(tel, { tel = it }, "Telefono di lavoro", tastiera = KeyboardType.Phone)
                CampoTesto(email, { email = it }, "Email di lavoro", tastiera = KeyboardType.Email)
            } else PulsanteTesto("+ Contatti di lavoro", { contatti = true })
            if (orario) CampoTesto(oreSett, { oreSett = it }, "Ore alla settimana", tastiera = KeyboardType.Decimal, suffisso = "ore su 5 giorni")
            else PulsanteTesto("+ Orario", { orario = true })
            errore?.let { Text(it, style = Testi.secondarioGrande, color = c.rossoTesto) }
        }
        FondoConPulsante(Modifier.align(Alignment.BottomCenter)) {
            PulsantePrincipale(if (inCorso) "Salvo…" else "Salva la persona", { salva() })
        }
    }
}
