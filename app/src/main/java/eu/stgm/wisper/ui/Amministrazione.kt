package eu.stgm.wisper.ui

import android.content.ClipData
import android.content.ClipboardManager
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
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
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import eu.stgm.wisper.Archivio
import eu.stgm.wisper.Dati
import eu.stgm.wisper.nomeModulo
import eu.stgm.wisper.rapportino.CopiaSicurezza
import eu.stgm.wisper.rapportino.FiltroRegistro
import eu.stgm.wisper.rapportino.Moduli
import eu.stgm.wisper.rapportino.Numerazione
import eu.stgm.wisper.rapportino.Numeri
import eu.stgm.wisper.rapportino.Permessi
import eu.stgm.wisper.rapportino.Ruoli
import eu.stgm.wisper.rapportino.Stampa
import eu.stgm.wisper.rapportino.Utente
import eu.stgm.wisper.rapportino.VoceRegistro
import eu.stgm.wisper.rapportino.istanteLocale
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.launch
import java.security.SecureRandom
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

/*
 * Amministrazione (docs/gestionale/fase1-schermate.md §7, prototipo
 * pagAmministrazione e seguenti): al posto delle Impostazioni, con dentro tutto
 * quello che facevano. Chi ha Amministrazione in lettura vede tutto senza i
 * pulsanti per cambiare.
 */

private val IT = Locale.ITALY

/** Le scritture che devono finire anche se si cambia pagina (l'Annulla di un avviso). */
private val ambitoAmm = MainScope()

// ---------------------------------------------------------------------------------- l'elenco

@Composable
fun SchermataAmministrazione(dati: Dati, archivio: Archivio, nav: Navigatore) {
    val c = W.colori
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    val copie = rememberLettura(Unit, 0) { dati.copie() }
    // Fase 3: i veicoli col loro euro al km (si leggono col modulo Spese).
    val vedeSpese = LocalPermessi.current.vede(Moduli.SPESE)
    val veicoli = rememberLettura(vedeSpese, 0) { if (vedeSpese) dati.veicoli() else Result.failure(Exception("")) }
    val anno = LocalDate.now().year
    val numCommesse = ana.numerazione("commessa")?.prossimoNumero(anno) ?: ana.prossimoCodiceCommessa(anno)
    val numRapportini = ana.numerazione("rapportino")?.prossimoNumero(anno)
    val voci = listOf(
        VoceAmm("Dati dello studio", "Intestazione dei PDF, la tua firma", Icone.scudo, "studio"),
        // Fase 4: le regole delle fatture e la conferma del commercialista.
        VoceAmm(
            "Impostazioni fiscali",
            if (eu.stgm.wisper.rapportino.RegoleFiscali.da(ana.impostazioni).confermate) "Regole confermate dal commercialista" else "Regole da confermare col commercialista",
            Icone.fatturazione, "fiscale",
        ).takeIf { LocalPermessi.current.vede(Moduli.FATTURAZIONE) },
        VoceAmm(
            "Utenti",
            if (ana.utenti.isEmpty()) "Chi entra in Wisper e con quale ruolo"
            else Testo.quanti(ana.utenti.size, "persona", "persone") + " · " + Testo.quanti(ana.utenti.count { it.attivo }, "attiva", "attive"),
            Icone.clienti, "utenti",
        ),
        VoceAmm("Ruoli e permessi", "Titolare, Amministrazione, Collaboratore, Lettura", Icone.lucchetto, "permessi"),
        VoceAmm("Numerazioni", "Commesse $numCommesse" + (numRapportini?.let { " · Rapportini $it" } ?: "") + " · le fatture le numera il programma", Icone.numero, "numerazioni"),
        VoceAmm(
            "Tariffe e rimborsi",
            listOfNotNull(Numeri.leggi(ana.impostazione("EURO_KM"))?.let { "Rimborso km ${Numeri.scrivi(it)} €" }, ana.costoOrario?.let { "costo orario ${Numeri.scrivi(it)} €" })
                .joinToString(", ").ifBlank { "Rimborso km, costo orario" },
            Icone.fatturazione, "tariffe",
        ),
        VoceAmm(
            "Veicoli e rimborso km",
            (veicoli as? Lettura.Pronta)?.dato?.veicoli?.firstOrNull()?.let { v -> v.nome + " · " + v.euroKmTesto + (v.annoAci?.let { " (ACI $it)" } ?: "") }
                ?: "Il veicolo, il suo €/km, le tabelle ACI",
            Icone.auto, "veicoli",
        ).takeIf { vedeSpese },
        // Fase 5 (fase5.md §12.4): le categorie dei documenti e lo spazio sul NAS, anche sul telefono.
        VoceAmm("Categorie dei documenti", "Approvazione, chi le vede, scadenza proposta", Icone.documento, "categorie").takeIf { LocalPermessi.current.vede(Moduli.DOCUMENTI) },
        VoceAmm("Spazio sul NAS", "Dove va lo spazio, copia fuori casa, cestino", Icone.disco, "spazio"),
        VoceAmm("Registro attività", "Chi ha cambiato cosa", Icone.lista, "registro"),
        VoceAmm(
            "Copie ed esportazioni",
            (copie as? Lettura.Pronta)?.dato?.ultima?.let { u -> if (u.riuscita) "Copia ${quandoCopia(u.quando).replaceFirstChar { it.lowercase() }}" else "L'ultima copia non è riuscita" }
                ?: "Copie di sicurezza, file per Excel",
            Icone.scarica, "copie",
        ),
        VoceAmm("Cestino", "File tolti, recuperabili", Icone.cestino, "cestino"),
        VoceAmm("L'app", "Tema, visita guidata, versione", Icone.amministrazione, "app"),
    ).filterNotNull()
    Column(
        Modifier.fillMaxSize().background(c.fondo).verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = 40.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Testata(onIndietro = { nav.indietro() })
        TitoloPagina("Amministrazione")
        Scheda(orizzontale = 18.dp, verticale = 0.dp, raggio = 22.dp, spazio = 0.dp) {
            voci.forEachIndexed { i, v ->
                if (i > 0) LineaElenco()
                RigaVoce(v.titolo, sotto = v.stato, icona = v.icona, onClick = { nav.vai("amm/${v.rotta}") })
            }
        }
    }
}

private class VoceAmm(val titolo: String, val stato: String, val icona: ImageVector, val rotta: String)

/** Le pagine di Amministrazione: "studio", "utenti", "utente/<id>", "permessi", … */
@Composable
fun PaginaAmministrazione(
    quale: String,
    dati: Dati,
    archivio: Archivio,
    nav: Navigatore,
    tema: String,
    onTema: (String) -> Unit,
    onVisita: () -> Unit,
) {
    val puo = LocalPermessi.current.modifica(Moduli.AMMINISTRAZIONE)
    val indietro = { nav.indietro() }
    when {
        quale == "studio" -> PaginaStudio(dati, puo, indietro)
        quale == "fiscale" -> PaginaImpostazioniFiscali(dati, puo, indietro)
        quale == "tariffe" -> PaginaTariffe(dati, puo, indietro)
        quale == "app" -> PaginaApp(archivio, tema, onTema, onVisita, indietro)
        quale == "utenti" -> PaginaUtenti(dati, nav, puo)
        quale.startsWith("utente/") -> PaginaUtente(dati, quale.removePrefix("utente/"), puo, indietro)
        quale == "permessi" -> PaginaPermessi(dati, puo, indietro)
        quale == "numerazioni" -> PaginaNumerazioni(dati, puo, indietro)
        quale == "registro" -> PaginaRegistro(dati, indietro)
        quale == "copie" -> PaginaCopie(dati, puo, indietro)
        quale == "cestino" -> PaginaCestino(dati, puo, indietro)
        quale == "categorie" -> PaginaCategorie(dati, puo, indietro)
        quale == "spazio" -> PaginaSpazio(dati, puo, indietro)
        quale == "veicoli" -> PaginaVeicoli(dati, nav, puo)
        quale == "veicolo-nuovo" -> PaginaVeicolo(dati, nav, "", puo)
        quale.startsWith("veicolo/") -> PaginaVeicolo(dati, nav, quale.removePrefix("veicolo/"), puo)
        else -> PaginaStudio(dati, puo, indietro)
    }
}

// ---------------------------------------------------------------------------------- letture

/** Una lettura dal server: in corso, pronta, o un errore da dire con Riprova. */
internal sealed interface Lettura<out T> {
    data object InCorso : Lettura<Nothing>
    data class Pronta<T>(val dato: T) : Lettura<T>
    data class Errore(val messaggio: String) : Lettura<Nothing>
}

/** Legge [leggi] entrando e a ogni cambio di [giro] (Riprova). Una lettura buona resta mentre se ne fa un'altra. */
@Composable
internal fun <T> rememberLettura(chiave: Any?, giro: Int, leggi: suspend () -> Result<T>): Lettura<T> {
    var stato by remember(chiave) { mutableStateOf<Lettura<T>>(Lettura.InCorso) }
    LaunchedEffect(chiave, giro) {
        stato = leggi().fold({ Lettura.Pronta(it) }, { Lettura.Errore(it.message?.takeIf { m -> m.isNotBlank() } ?: "Il server non risponde: riprova") })
    }
    return stato
}

/** Il posto di una lettura che non è pronta: i segnaposto, o l'errore con Riprova. */
@Composable
private fun StatoLettura(l: Lettura<*>, onRiprova: () -> Unit) {
    when (l) {
        Lettura.InCorso -> { Segnaposto(72.dp); Segnaposto(72.dp) }
        is Lettura.Errore -> Scheda(orizzontale = 20.dp, verticale = 18.dp) {
            Text(l.messaggio, style = Testi.testo, color = W.colori.testo2)
            PulsanteBordo("Riprova", onRiprova, Modifier.fillMaxWidth(), icona = Icone.riapri)
        }
        else -> {}
    }
}

// ---------------------------------------------------------------------------------- utenti

@Composable
private fun PaginaUtenti(dati: Dati, nav: Navigatore, puo: Boolean) {
    val c = W.colori
    var giro by remember { mutableIntStateOf(0) }
    val lettura = rememberLettura(Unit, giro) { dati.utenti() }
    var nuovo by remember { mutableStateOf(false) }
    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = if (puo) SpazioSottoBarra else 40.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Testata(onIndietro = { nav.indietro() })
            TitoloPagina("Utenti")
            when (lettura) {
                is Lettura.Pronta -> Scheda(orizzontale = 18.dp, verticale = 0.dp, raggio = 22.dp, spazio = 0.dp) {
                    val utenti = lettura.dato.sortedWith(compareBy({ !it.attivo }, { Ruoli.ELENCO.indexOf(it.ruolo) }, { it.nome }))
                    if (utenti.isEmpty()) Text("Nessun utente", style = Testi.secondarioGrande, color = c.tenue, modifier = Modifier.padding(vertical = 16.dp))
                    utenti.forEachIndexed { i, u ->
                        if (i > 0) LineaElenco()
                        RigaVoce(
                            u.nome,
                            sotto = listOf(u.email, "ultimo accesso " + quandoBreve(u.ultimoAccesso)).filter { it.isNotBlank() }.joinToString(" · "),
                            inizio = { CerchioPersona(u.iniziali, 40.dp) },
                            fine = {
                                Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                    ParolaGrigia(Ruoli.nome(u.ruolo))
                                    if (!u.attivo) ParolaGrigia("Disattivato")
                                }
                            },
                            freccia = false,
                            onClick = { nav.vai("amm/utente/${u.id}") },
                        )
                    }
                }
                else -> StatoLettura(lettura) { giro++ }
            }
        }
        if (puo) {
            FondoConPulsante(Modifier.align(Alignment.BottomCenter)) {
                PulsantePrincipale("Nuovo utente", { nuovo = true }, icona = Icone.piu)
            }
        }
    }
    if (nuovo) FoglioNuovoUtente(dati, onChiudi = { nuovo = false; giro++ })
}

/** Nuovo utente: nome, email, ruolo (già scelto Collaboratore); poi la password iniziale, una volta sola. */
@Composable
private fun FoglioNuovoUtente(dati: Dati, onChiudi: () -> Unit) {
    val c = W.colori
    val scope = rememberCoroutineScope()
    var nome by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var ruolo by remember { mutableStateOf(Ruoli.COLLABORATORE) }
    var provato by remember { mutableStateOf(false) }
    var salvo by remember { mutableStateOf(false) }
    var errore by remember { mutableStateOf<String?>(null) }
    var fatto by remember { mutableStateOf<Pair<String, String>?>(null) }
    FoglioDalBasso(onChiudi) {
        val f = fatto
        if (f != null) {
            PasswordDaDire(f.first, f.second, onFatto = onChiudi)
            return@FoglioDalBasso
        }
        Text("Nuovo utente", style = Testi.titoloScheda, color = c.testo)
        Column(Modifier.heightIn(max = 560.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            CampoTesto(nome, { nome = it }, "Nome", Modifier.fillMaxWidth(), errore = if (provato && nome.isBlank()) "Scrivi il nome" else null)
            CampoTesto(email, { email = it.trim() }, "Email", Modifier.fillMaxWidth(), tastiera = KeyboardType.Email,
                errore = if (provato && !email.contains('@')) "Scrivi l'email con cui entrerà, per esempio nome@esempio.it" else null)
            Etichetta("Ruolo")
            (Ruoli.ELENCO.filter { it != Ruoli.TITOLARE } + Ruoli.TITOLARE).forEach { r ->
                SceltaRuolo(r, r == ruolo) { ruolo = r }
            }
        }
        errore?.let { Text(it, style = Testi.secondario, color = c.rossoTesto) }
        PulsantePrincipale(if (salvo) "Creo…" else "Crea l'utente", {
            provato = true
            if (salvo || nome.isBlank() || !email.contains('@')) return@PulsantePrincipale
            salvo = true
            errore = null
            val password = generaPassword()
            scope.launch {
                dati.salvaUtente(Utente("", nome.trim(), email.trim(), ruolo, true), password)
                    .onSuccess { s -> fatto = s.utente.nome to s.password.ifBlank { password } }
                    .onFailure { errore = it.message ?: "L'utente non è stato creato: riprova" }
                salvo = false
            }
        }, altezza = 56.dp, abilitato = !salvo)
    }
}

/** La password da comunicare a voce: si vede una volta, si copia, poi la cambia lui. */
@Composable
private fun PasswordDaDire(nome: String, password: String, onFatto: () -> Unit) {
    val c = W.colori
    val ctx = LocalContext.current
    val avvisi = LocalAvvisi.current
    Text("Password di $nome", style = Testi.titoloScheda, color = c.testo)
    Box(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(c.fondo).border(1.5.dp, c.bordoCampo, RoundedCornerShape(16.dp)).padding(vertical = 18.dp),
        contentAlignment = Alignment.Center,
    ) { Text(password, style = Testi.numeroGrande.copy(letterSpacing = 1.5.sp), color = c.testo, textAlign = TextAlign.Center) }
    PulsanteBordo("Copia", {
        ctx.getSystemService(ClipboardManager::class.java)?.setPrimaryClip(ClipData.newPlainText("Password", password))
        avvisi.mostra("Copiata")
    }, Modifier.fillMaxWidth(), icona = Icone.copia, altezza = 48.dp)
    Text("Comunicala a voce: la cambierà lui al primo accesso. Dopo non si vede più.", style = Testi.testo, color = c.testo2)
    PulsantePrincipale("Fatto", onFatto, altezza = 56.dp)
}

/** Una scelta di ruolo: il pallino, il nome e la frase che dice cosa vede. */
@Composable
private fun SceltaRuolo(ruolo: String, scelto: Boolean, onClick: () -> Unit) {
    val c = W.colori
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(if (scelto) c.scelta else c.scheda)
            .border(if (scelto) 2.dp else 1.5.dp, if (scelto) c.testo else c.bordoScheda, RoundedCornerShape(16.dp))
            .clickable(onClick = onClick).semantics { role = Role.RadioButton; selected = scelto }
            .padding(14.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(
            Modifier.padding(top = 1.dp).size(22.dp).clip(CircleShape).border(2.dp, if (scelto) c.testo else c.bordoCampo, CircleShape),
            contentAlignment = Alignment.Center,
        ) { if (scelto) Box(Modifier.size(10.dp).clip(CircleShape).background(c.testo)) }
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(Ruoli.nome(ruolo), style = Testi.forte, color = c.testo)
            Text(Ruoli.frase(ruolo), style = Testi.secondario, color = c.tenue)
        }
    }
}

/** La pagina di un utente: ruolo, nuova password, disattiva, dispositivi collegati. */
@Composable
private fun PaginaUtente(dati: Dati, id: String, puo: Boolean, onIndietro: () -> Unit) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    var giro by remember { mutableIntStateOf(0) }
    var giroDisp by remember { mutableIntStateOf(0) }
    val lettura = rememberLettura(id, giro) { dati.utenti() }
    val dispositivi = rememberLettura(id + "disp", giroDisp) { dati.dispositivi(id) }
    var sceltaRuolo by remember { mutableStateOf(false) }
    var nuovoRuolo by remember { mutableStateOf<String?>(null) }
    var conferma by remember { mutableStateOf<String?>(null) }
    var password by remember { mutableStateOf<Pair<String, String>?>(null) }
    var daScollegare by remember { mutableStateOf<eu.stgm.wisper.rapportino.Dispositivo?>(null) }

    val tutti = (lettura as? Lettura.Pronta)?.dato
    val u = tutti?.firstOrNull { it.id == id }
    Column(
        Modifier.fillMaxSize().background(c.fondo).verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = 40.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Testata(onIndietro = onIndietro)
        if (u == null) {
            if (lettura is Lettura.Pronta) Text("Non trovo questo utente.", style = Testi.testo, color = c.tenue)
            else StatoLettura(lettura) { giro++ }
            return@Column
        }
        val ultimoTitolare = u.ruolo == Ruoli.TITOLARE && tutti.count { it.ruolo == Ruoli.TITOLARE && it.attivo } <= 1
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            CerchioPersona(u.iniziali, 56.dp)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(u.nome, style = Testi.titoloPagina.copy(fontSize = 26.sp, lineHeight = 30.sp), color = c.testo)
                Text(u.email, style = Testi.secondarioGrande, color = c.tenue)
                if (!u.attivo) ParolaGrigia("Disattivato")
            }
        }
        SchedaElenco {
            RigaVoce(
                "Ruolo · ${Ruoli.nome(u.ruolo)}", sotto = Ruoli.frase(u.ruolo), freccia = puo && !ultimoTitolare,
                onClick = if (puo && !ultimoTitolare) ({ sceltaRuolo = true }) else null,
            )
            LineaElenco()
            RigaVoce("Ultimo accesso", valore = quandoBreve(u.ultimoAccesso))
        }
        if (ultimoTitolare) {
            Text("È l'unico titolare: non si può disattivare né cambiare di ruolo.", style = Testi.secondario, color = c.tenue)
        }
        if (puo) {
            PulsanteBordo("Nuova password", { conferma = "password" }, Modifier.fillMaxWidth(), icona = Icone.lucchetto, altezza = 48.dp)
            if (!ultimoTitolare) PulsanteBordo(
                if (u.attivo) "Disattiva" else "Riattiva", { conferma = if (u.attivo) "disattiva" else "riattiva" },
                Modifier.fillMaxWidth(), icona = if (u.attivo) Icone.pausa else Icone.riapri, altezza = 48.dp,
            )
        }
        TitoloSezione("Dispositivi collegati")
        when (dispositivi) {
            is Lettura.Pronta -> Scheda(orizzontale = 18.dp, verticale = 0.dp, raggio = 22.dp, spazio = 0.dp) {
                if (dispositivi.dato.isEmpty()) Text("Nessun dispositivo collegato", style = Testi.secondarioGrande, color = c.tenue, modifier = Modifier.padding(vertical = 16.dp))
                dispositivi.dato.forEachIndexed { i, d ->
                    if (i > 0) LineaElenco()
                    RigaVoce(
                        d.nome + if (d.questo) " · questo" else "",
                        sotto = listOf(d.app, "ultimo uso " + quandoBreve(d.ultimoUso)).filter { it.isNotBlank() }.joinToString(" · "),
                        icona = if (d.app.contains("computer", ignoreCase = true)) Icone.lista else Icone.telefono,
                        fine = if (puo) ({ PulsanteTesto("Scollega", { daScollegare = d }) }) else null,
                        freccia = false,
                    )
                }
            }
            else -> StatoLettura(dispositivi) { giroDisp++ }
        }
    }

    fun salva(nuovo: Utente, pw: String = "", fatto: String) {
        ambitoAmm.launch {
            dati.salvaUtente(nuovo, pw)
                .onSuccess { s ->
                    giro++
                    if (pw.isNotBlank()) password = s.utente.nome to s.password.ifBlank { pw } else avvisi.mostra(fatto)
                    if (!nuovo.attivo) giroDisp++
                }
                .onFailure { avvisi.mostra(it.message ?: "Non è cambiato niente: riprova") }
        }
    }

    if (sceltaRuolo && u != null) {
        FoglioDalBasso({ sceltaRuolo = false }) {
            Text("Ruolo di ${u.nome.substringBefore(' ')}", style = Testi.titoloScheda, color = c.testo)
            Ruoli.ELENCO.forEach { r -> SceltaRuolo(r, r == u.ruolo) { sceltaRuolo = false; if (r != u.ruolo) nuovoRuolo = r } }
        }
    }
    nuovoRuolo?.let { r ->
        if (u != null) FoglioConferma(
            titolo = "${u.nome.substringBefore(' ')} diventa ${Ruoli.nome(r)}?",
            testo = Ruoli.frase(r) + " Vale da subito, anche sui suoi dispositivi.",
            azione = "Cambia il ruolo",
            onConferma = { nuovoRuolo = null; salva(u.copy(ruolo = r), fatto = "Ruolo cambiato: vale da subito") },
            onAnnulla = { nuovoRuolo = null },
        )
    }
    conferma?.let { cosa ->
        if (u != null) when (cosa) {
            "password" -> FoglioConferma(
                "Dare una password nuova a ${u.nome.substringBefore(' ')}?",
                "Quella di prima smette di funzionare. La nuova si vede una volta sola: comunicala a voce.",
                "Nuova password",
                onConferma = { conferma = null; salva(u, generaPassword(), "") },
                onAnnulla = { conferma = null },
            )
            "disattiva" -> FoglioConferma(
                "Disattivare ${u.nome}?",
                "Non potrà più entrare e i suoi dispositivi vengono scollegati. I suoi rapportini restano.",
                "Disattiva",
                onConferma = { conferma = null; salva(u.copy(attivo = false), fatto = "${u.nome} disattivato") },
                onAnnulla = { conferma = null },
            )
            else -> FoglioConferma(
                "Riattivare ${u.nome}?", "Potrà entrare di nuovo con la sua password.", "Riattiva",
                onConferma = { conferma = null; salva(u.copy(attivo = true), fatto = "${u.nome} riattivato") },
                onAnnulla = { conferma = null },
            )
        }
    }
    password?.let { (nome, pw) ->
        FoglioDalBasso({ password = null }) { PasswordDaDire(nome, pw) { password = null } }
    }
    daScollegare?.let { d ->
        FoglioConferma(
            "Scollegare ${d.nome}?", "Per usare Wisper lì dovrà entrare di nuovo.", "Scollega",
            onConferma = {
                daScollegare = null
                ambitoAmm.launch {
                    dati.scollega(d.id).onSuccess { avvisi.mostra("Scollegato ${d.nome}"); giroDisp++ }
                        .onFailure { avvisi.mostra(it.message ?: "Non è stato scollegato: riprova") }
                }
            },
            onAnnulla = { daScollegare = null },
        )
    }
}

/** Tre gruppi di quattro, senza lettere che si confondono (0 e O, 1 e I): K7QM-3XTA-9PHD. */
internal fun generaPassword(): String {
    val alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    val caso = SecureRandom()
    return (0 until 3).joinToString("-") { (0 until 4).map { alfabeto[caso.nextInt(alfabeto.length)] }.joinToString("") }
}

// ---------------------------------------------------------------------------------- ruoli e permessi

private val SPIEGA_MODULI = mapOf(
    Moduli.DASHBOARD to "La pagina iniziale",
    Moduli.CLIENTI to "Anagrafiche, referenti, sedi",
    Moduli.COMMESSE to "Commesse e prestazioni",
    Moduli.PREVENTIVI to "Preventivi, listino, incarichi",
    Moduli.ATTIVITA to "Le attività di tutti o solo le sue",
    Moduli.RAPPORTINI to "I rapportini di tutti o solo i suoi",
    Moduli.FATTURAZIONE to "Da fatturare, riepiloghi",
    Moduli.AMMINISTRAZIONE to "Studio, utenti, permessi, copie",
    Moduli.COSTI to "Tariffe, totali, costi e margini",
)

@Composable
private fun PaginaPermessi(dati: Dati, puo: Boolean, onIndietro: () -> Unit) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    var giro by remember { mutableIntStateOf(0) }
    val lettura = rememberLettura(Unit, giro) { dati.permessiRuoli() }
    var ruolo by remember { mutableStateOf(Ruoli.COLLABORATORE) }
    // I cambi si vedono subito: sopra quello che ha detto il server.
    var cambiati by remember { mutableStateOf<Map<String, Permessi>>(emptyMap()) }

    Column(
        Modifier.fillMaxSize().background(c.fondo).verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = 40.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Testata(onIndietro = onIndietro)
        TitoloPagina("Ruoli e permessi")
        SegmentiScorrevoli(Ruoli.ELENCO.map { it to Ruoli.nome(it) }, ruolo, { ruolo = it })
        val bloccato = ruolo == Ruoli.TITOLARE
        Scheda(orizzontale = 18.dp, verticale = 16.dp, raggio = 22.dp, spazio = 4.dp) {
            Text(Ruoli.nome(ruolo), style = Testi.forteGrande, color = c.testo)
            Text(Ruoli.frase(ruolo) + if (bloccato) " Il titolare ha sempre tutto." else "", style = Testi.secondarioGrande, color = c.tenue)
        }
        when (lettura) {
            is Lettura.Pronta -> {
                val p = cambiati[ruolo] ?: lettura.dato[ruolo] ?: Permessi.iniziali(ruolo)
                Scheda(orizzontale = 18.dp, verticale = 4.dp, raggio = 22.dp, spazio = 0.dp) {
                    (Moduli.FUNZIONANTI + Moduli.COSTI).forEachIndexed { i, m ->
                        if (i > 0) LineaElenco()
                        Row(
                            Modifier.fillMaxWidth().heightIn(min = 60.dp).padding(vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text(nomeModulo(m), style = Testi.secondarioGrande.copy(fontWeight = FontWeight.ExtraBold), color = c.testo)
                                Text(SPIEGA_MODULI[m].orEmpty(), style = Testi.piccolo, color = c.tenue)
                            }
                            Livelli(nomeModulo(m), if (bloccato) 2 else p.livello(m), attivo = puo && !bloccato) { nuovo ->
                                val prima = p.livello(m)
                                if (nuovo == prima) return@Livelli
                                val r = ruolo
                                cambiati = cambiati + (r to Permessi(p.livelli + (m to nuovo)))
                                ambitoAmm.launch {
                                    dati.salvaPermesso(r, m, nuovo)
                                        .onSuccess {
                                            avvisi.mostra("Permesso cambiato: vale da subito") {
                                                cambiati = cambiati + (r to Permessi((cambiati[r] ?: p).livelli + (m to prima)))
                                                ambitoAmm.launch { dati.salvaPermesso(r, m, prima).onFailure { e -> avvisi.mostra(e.message ?: "Non è tornato com'era: riprova"); giro++ } }
                                            }
                                        }
                                        .onFailure { e ->
                                            cambiati = cambiati + (r to Permessi((cambiati[r] ?: p).livelli + (m to prima)))
                                            avvisi.mostra(e.message ?: "Il permesso non è cambiato: riprova")
                                        }
                                }
                            }
                        }
                    }
                }
            }
            else -> StatoLettura(lettura) { giro++ }
        }
    }
}

/** Niente | Vede | Modifica: grigio, blu tenue, verde tenue. */
@Composable
private fun Livelli(cosa: String, livello: Int, attivo: Boolean, onScelta: (Int) -> Unit) {
    val c = W.colori
    Row(
        Modifier.clip(RoundedCornerShape(12.dp)).background(c.superficie2).padding(3.dp).alpha(if (attivo) 1f else if (livello >= 0) 0.75f else 1f),
        horizontalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        listOf("Niente", "Vede", "Modifica").forEachIndexed { i, nome ->
            val su = i == livello
            val (fondo, testo) = when {
                !su -> Color.Transparent to c.tenue
                i == 0 -> c.scheda to c.testo2
                i == 1 -> c.inviatoFondo to c.inviatoTesto
                else -> c.firmatoFondo to c.firmatoTesto
            }
            Box(
                Modifier.heightIn(min = 44.dp).clip(RoundedCornerShape(9.dp)).background(fondo)
                    .let { if (attivo) it.clickable { onScelta(i) } else it }
                    .semantics { role = Role.RadioButton; selected = su; contentDescription = "$cosa: $nome" }
                    .padding(horizontal = 9.dp),
                contentAlignment = Alignment.Center,
            ) { Text(nome, style = Testi.piccolo.copy(fontWeight = FontWeight.ExtraBold), color = testo, maxLines = 1) }
        }
    }
}

// ---------------------------------------------------------------------------------- numerazioni

@Composable
private fun PaginaNumerazioni(dati: Dati, puo: Boolean, onIndietro: () -> Unit) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    var modifica by remember { mutableStateOf<Numerazione?>(null) }
    val anno = LocalDate.now().year
    // Col foglio di prima le numerazioni non arrivano: la commessa si calcola come sempre.
    val elenco = ana.numerazioni.ifEmpty {
        listOf(Numerazione("commessa", "{AA}ST{NNN}", prossimo = ana.prossimoCodiceCommessa(anno)), Numerazione("rapportino", "RAP/{AAAA}/{NNNN}", annuale = true))
    }
    Column(
        Modifier.fillMaxSize().background(c.fondo).verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = 40.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Testata(onIndietro = onIndietro)
        TitoloPagina("Numerazioni")
        elenco.forEach { n ->
            Scheda(orizzontale = 18.dp, verticale = 18.dp, raggio = 22.dp, spazio = 12.dp) {
                Etichetta(when (n.tipo) { "commessa" -> "Commesse"; "rapportino" -> "Rapportini"; "preventivo" -> "Preventivi"; else -> n.tipo })
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(
                        n.prossimoNumero(anno), style = Testi.forte.copy(fontSize = 16.sp), color = if (c.scuro) c.suGiallo else c.giallo,
                        modifier = Modifier.clip(RoundedCornerShape(8.dp)).background(if (c.scuro) c.giallo else c.suGiallo).padding(horizontal = 10.dp, vertical = 6.dp),
                    )
                    Text("la prossima", style = Testi.secondarioGrande, color = c.tenue)
                }
                Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text("Formato", style = Testi.piccolo, color = c.tenue)
                        Text(Numerazione.aParole(n.formato), style = Testi.forte.copy(fontWeight = FontWeight.Bold), color = c.testo)
                    }
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text("Numero", style = Testi.piccolo, color = c.tenue)
                        Text(if (n.annuale) "riparte a gennaio" else "continua da un anno all'altro", style = Testi.forte.copy(fontWeight = FontWeight.Bold), color = c.testo)
                    }
                }
                if (puo && ana.numerazioni.isNotEmpty()) PulsanteBordo("Modifica", { modifica = n }, icona = Icone.matita, altezza = 44.dp)
            }
        }
    }
    modifica?.let { n ->
        FoglioNumerazione(n, onSalva = { nuova, fatto ->
            ambitoAmm.launch {
                dati.salvaNumerazione(nuova)
                    .onSuccess { fatto(null); avvisi.mostra("Salvato. Vale solo per i numeri nuovi: quelli già dati non cambiano") }
                    .onFailure { fatto(it.message ?: "Non è stato salvato: riprova") }
            }
        }, onChiudi = { modifica = null })
    }
}

/**
 * Il formato coi pezzi da toccare: testo prima, anno (4 o 2 cifre, o niente),
 * testo in mezzo, il numero con N cifre; riparte a gennaio sì o no; l'anteprima.
 */
@Composable
private fun FoglioNumerazione(n: Numerazione, onSalva: (Numerazione, (String?) -> Unit) -> Unit, onChiudi: () -> Unit) {
    val c = W.colori
    val pezzi = remember(n.formato) { Regex("""^(.*?)(\{AAAA\}|\{AA\})?(.*?)\{(N+)\}(.*)$""").find(n.formato) }
    var prima by remember { mutableStateOf(pezzi?.groupValues?.get(1).orEmpty()) }
    var anno by remember { mutableStateOf(when (pezzi?.groupValues?.get(2)) { "{AAAA}" -> "4"; "{AA}" -> "2"; else -> if (pezzi == null) "2" else "0" }) }
    var mezzo by remember { mutableStateOf(pezzi?.groupValues?.get(3) ?: "ST") }
    var cifre by remember { mutableIntStateOf(pezzi?.groupValues?.get(4)?.length ?: 3) }
    var annuale by remember { mutableStateOf(n.annuale) }
    var salvo by remember { mutableStateOf(false) }
    var errore by remember { mutableStateOf<String?>(null) }
    val dopo = pezzi?.groupValues?.get(5).orEmpty()
    val formato = prima + when (anno) { "4" -> "{AAAA}"; "2" -> "{AA}"; else -> "" } + mezzo + "{" + "N".repeat(cifre) + "}" + dopo
    val anteprima = Numerazione.applica(formato, n.ultimo + 1, LocalDate.now().year)
    FoglioDalBasso(onChiudi) {
        Text(if (n.tipo == "commessa") "Numero delle commesse" else "Numero dei rapportini", style = Testi.titoloScheda, color = c.testo)
        Column(Modifier.heightIn(max = 560.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(c.fondo).padding(vertical = 16.dp), contentAlignment = Alignment.Center) {
                Text(anteprima, style = Testi.numeroGrande, color = c.testo)
            }
            CampoTesto(prima, { prima = it.take(8) }, "Testo prima", Modifier.fillMaxWidth(), segnaposto = "—")
            Text("Anno", style = Testi.secondarioGrande.copy(fontWeight = FontWeight.Bold), color = c.testo)
            Segmenti(listOf("4" to "4 cifre", "2" to "2 cifre", "0" to "Niente"), anno, { anno = it })
            CampoTesto(mezzo, { mezzo = it.take(8) }, "Testo in mezzo", Modifier.fillMaxWidth(), segnaposto = "—")
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Cifre del numero", style = Testi.forte, color = c.testo, modifier = Modifier.weight(1f))
                PulsanteTondo(Icone.meno, "Una cifra in meno", { cifre = (cifre - 1).coerceAtLeast(1) }, dimensione = 48.dp)
                Text("$cifre", style = Testi.numeroGrande, color = c.testo, textAlign = TextAlign.Center, modifier = Modifier.width(44.dp))
                PulsanteTondo(Icone.piu, "Una cifra in più", { cifre = (cifre + 1).coerceAtMost(6) }, dimensione = 48.dp)
            }
            RigaInterruttore("Riparte a gennaio", annuale) { annuale = it }
        }
        errore?.let { Text(it, style = Testi.secondario, color = c.rossoTesto) }
        PulsantePrincipale(if (salvo) "Salvo…" else "Salva", {
            if (salvo) return@PulsantePrincipale
            salvo = true
            errore = null
            onSalva(n.copy(formato = formato, annuale = annuale, prossimo = "")) { e -> salvo = false; if (e == null) onChiudi() else errore = e }
        }, altezza = 56.dp, abilitato = !salvo)
    }
}

// ---------------------------------------------------------------------------------- registro

private val TABELLE = listOf(
    "" to "Tutto",
    "soggetti" to "Clienti e fornitori",
    "commesse" to "Commesse",
    "prestazioni" to "Prestazioni",
    "rapportini" to "Rapportini",
    "utenti" to "Utenti",
    "permessi" to "Permessi",
    "impostazioni" to "Impostazioni",
)

private val PERIODI = listOf(1 to "Oggi", 7 to "Ultimi 7 giorni", 30 to "Ultimi 30 giorni", 0 to "Da sempre")

@Composable
private fun PaginaRegistro(dati: Dati, onIndietro: () -> Unit) {
    val c = W.colori
    val ctx = LocalContext.current
    val avvisi = LocalAvvisi.current
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    var filtro by remember { mutableStateOf(FiltroRegistro()) }
    var giro by remember { mutableIntStateOf(0) }
    var altrePagine by remember(filtro) { mutableStateOf<List<VoceRegistro>>(emptyList()) }
    var pagina by remember(filtro) { mutableIntStateOf(0) }
    var ancora by remember(filtro) { mutableStateOf<Boolean?>(null) }
    val lettura = rememberLettura(filtro, giro) { dati.registro(filtro) }
    var foglio by remember { mutableStateOf<String?>(null) }
    var voceAperta by remember { mutableStateOf<VoceRegistro?>(null) }
    val scope = rememberCoroutineScope()
    var esporto by remember { mutableStateOf(false) }

    Column(
        Modifier.fillMaxSize().background(c.fondo).verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = 40.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Testata(onIndietro = onIndietro)
        TitoloPagina("Registro attività")
        @OptIn(ExperimentalLayoutApi::class)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            val stileFiltro = Testi.secondario.copy(fontWeight = FontWeight.Bold)
            PulsanteBordo(ana.utente(filtro.utente)?.nome ?: "Tutte le persone", { foglio = "persone" }, altezza = 44.dp, stile = stileFiltro)
            PulsanteBordo(TABELLE.firstOrNull { it.first == filtro.tabella }?.second ?: "Tutto", { foglio = "cosa" }, altezza = 44.dp, stile = stileFiltro)
            PulsanteBordo(PERIODI.firstOrNull { it.first == filtro.giorni }?.second ?: "Ultimi 7 giorni", { foglio = "quando" }, altezza = 44.dp, stile = stileFiltro)
        }
        when (lettura) {
            is Lettura.Pronta -> {
                val voci = lettura.dato.voci + altrePagine
                if (voci.isEmpty()) {
                    Text("Niente per questi filtri.", style = Testi.secondarioGrande, color = c.tenue, modifier = Modifier.fillMaxWidth().padding(vertical = 20.dp), textAlign = TextAlign.Center)
                } else {
                    voci.groupBy { it.istante?.toLocalDate() }.forEach { (giorno, vv) ->
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Etichetta(nomeGiorno(giorno))
                            Scheda(orizzontale = 18.dp, verticale = 2.dp, raggio = 22.dp, spazio = 0.dp) {
                                vv.forEachIndexed { i, v ->
                                    if (i > 0) LineaElenco()
                                    VoceDelRegistro(v, oggettoDi(v, ana)) { voceAperta = v }
                                }
                            }
                        }
                    }
                    when {
                        (ancora ?: lettura.dato.altre) -> PulsanteBordo("Carica altri", {
                            scope.launch {
                                dati.registro(filtro.copy(pagina = pagina + 1)).onSuccess { p ->
                                    pagina += 1
                                    altrePagine = altrePagine + p.voci
                                    ancora = p.altre
                                }.onFailure { avvisi.mostra(it.message ?: "Non riesco a leggere il resto: riprova") }
                            }
                        }, Modifier.fillMaxWidth(), altezza = 48.dp)
                        else -> Text("Inizio del registro", style = Testi.secondario, color = c.tenue, modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center)
                    }
                }
                PulsanteTesto(if (esporto) "Preparo il file…" else "Esporta per Excel", {
                    if (esporto) return@PulsanteTesto
                    esporto = true
                    scope.launch {
                        dati.esporta("registro", filtro)
                            .onSuccess { f -> Stampa.condividi(ctx, f, "Registro attività", "text/csv") }
                            .onFailure { avvisi.mostra(it.message ?: "Il file non è pronto: riprova") }
                        esporto = false
                    }
                }, Modifier.align(Alignment.CenterHorizontally))
            }
            else -> StatoLettura(lettura) { giro++ }
        }
    }

    foglio?.let { quale ->
        FoglioDalBasso({ foglio = null }) {
            Text(when (quale) { "persone" -> "Chi"; "cosa" -> "Cosa"; else -> "Quando" }, style = Testi.titoloScheda, color = c.testo)
            Column(Modifier.heightIn(max = 440.dp).verticalScroll(rememberScrollState())) {
                val voci: List<Pair<String, String>> = when (quale) {
                    "persone" -> listOf("" to "Tutte le persone") + ana.utenti.map { it.id to it.nome }
                    "cosa" -> TABELLE
                    else -> PERIODI.map { it.first.toString() to it.second }
                }
                voci.forEachIndexed { i, (valore, nome) ->
                    if (i > 0) LineaElenco()
                    val scelta = when (quale) { "persone" -> filtro.utente == valore; "cosa" -> filtro.tabella == valore; else -> filtro.giorni.toString() == valore }
                    Row(
                        Modifier.fillMaxWidth().heightIn(min = 56.dp).clickable {
                            filtro = when (quale) {
                                "persone" -> filtro.copy(utente = valore, pagina = 0)
                                "cosa" -> filtro.copy(tabella = valore, pagina = 0)
                                else -> filtro.copy(giorni = valore.toInt(), pagina = 0)
                            }
                            foglio = null
                        }.padding(horizontal = 4.dp).semantics { selected = scelta },
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(nome, style = Testi.forteGrande, color = c.testo, modifier = Modifier.weight(1f))
                        if (scelta) Icon(Icone.spunta, null, tint = c.testo, modifier = Modifier.size(20.dp))
                    }
                }
            }
        }
    }
    voceAperta?.let { v ->
        FoglioDalBasso({ voceAperta = null }) {
            Text(fraseCompleta(v, ana), style = Testi.testo, color = c.testo2)
            Text(quandoBreve(v.quando), style = Testi.secondario, color = c.tenue)
            if (v.campi.isEmpty()) Text("Nessun campo cambiato da mostrare.", style = Testi.secondario, color = c.tenue)
            v.campi.forEach { campo ->
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(campo.campo, style = Testi.piccolo.copy(fontWeight = FontWeight.Bold), color = c.tenue)
                    PrimaDopo(campo.prima, campo.dopo)
                }
            }
            PulsanteTesto("Chiudi", { voceAperta = null }, Modifier.fillMaxWidth(), colore = c.testo)
        }
    }
}

/** Una voce: le iniziali, la frase con chi e su cosa in grassetto, prima e dopo, l'ora. */
@Composable
private fun VoceDelRegistro(v: VoceRegistro, oggetto: String, onClick: () -> Unit) {
    val c = W.colori
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(vertical = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        CerchioPersona(v.chi.take(1).uppercase().ifBlank { "?" }, 34.dp)
        Column(Modifier.weight(1f)) {
            Text(
                buildAnnotatedString {
                    withStyle(SpanStyle(fontWeight = FontWeight.ExtraBold, color = c.testo)) { append(v.chi.ifBlank { "Qualcuno" }) }
                    append(" " + fraseDi(v) + " ")
                    if (oggetto.isNotBlank()) withStyle(SpanStyle(fontWeight = FontWeight.ExtraBold, color = c.testo)) { append(oggetto) }
                    if (v.coda.isNotBlank()) append(" " + v.coda)
                },
                style = Testi.secondarioGrande.copy(lineHeight = 21.sp), color = c.testo2,
            )
            // Prima e dopo solo per una modifica di un campo solo: in una riga nuova il "dopo"
            // ripeterebbe il nome appena scritto nella frase (RAP/2026/0006 due volte).
            val cambiati = campiDaMostrare(v)
            if (!v.nuova && !v.tolta && cambiati.size == 1) Box(Modifier.padding(top = 6.dp)) { PrimaDopo(cambiati[0].prima, cambiati[0].dopo) }
            Text(quandoBreve(v.quando), style = Testi.piccolo, color = c.tenue, modifier = Modifier.padding(top = 2.dp))
        }
    }
}

/** Prima barrato su grigio, poi la freccia, poi il dopo su verde tenue. */
@Composable
private fun PrimaDopo(prima: String, dopo: String) {
    val c = W.colori
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        if (prima.isNotBlank()) {
            Text(
                prima, style = Testi.secondario.copy(fontWeight = FontWeight.Bold, textDecoration = TextDecoration.LineThrough), color = c.tenue,
                modifier = Modifier.clip(RoundedCornerShape(6.dp)).background(c.superficie2).padding(horizontal = 6.dp, vertical = 1.dp),
            )
            Icon(Icone.freccia, null, tint = c.tenue, modifier = Modifier.size(14.dp))
        }
        Text(
            dopo.ifBlank { "vuoto" }, style = Testi.secondario.copy(fontWeight = FontWeight.Bold), color = c.firmatoTesto,
            modifier = Modifier.clip(RoundedCornerShape(6.dp)).background(c.firmatoFondo).padding(horizontal = 6.dp, vertical = 1.dp),
        )
    }
}

/** La frase della voce: quella del server, o una scritta qui da azione e tabella. */
private fun fraseDi(v: VoceRegistro): String {
    if (v.frase.isNotBlank()) return v.frase
    val cosa = when (v.tabella) {
        "soggetti", "clienti" -> "il cliente"
        "fornitori" -> "il fornitore"
        "commesse" -> "la commessa"
        "prestazioni" -> "la prestazione"
        "rapportini" -> "il rapportino"
        "referenti" -> "il referente"
        "sedi" -> "la sede"
        "utenti" -> "l'utente"
        "permessi" -> "i permessi di"
        "numerazioni" -> "la numerazione"
        "impostazioni" -> "l'impostazione"
        "file" -> "il file"
        else -> v.tabella
    }
    // Le azioni del server si chiamano come nel protocollo (salvaSoggetto, archiviaCommessa…): conta come cominciano.
    val a = v.azione.lowercase()
    return when {
        a == "accedi" -> "è entrato"
        a == "esci" -> "è uscito"
        a.startsWith("archivia") -> "ha archiviato $cosa"
        a.startsWith("ripristina") -> "ha ripristinato $cosa"
        a == "stato" || a.startsWith("statocommessa") -> "ha cambiato lo stato di"
        a.startsWith("duplica") -> "ha creato $cosa"
        a.startsWith("togli") || a.startsWith("revoca") || v.tolta -> "ha tolto $cosa"
        a.startsWith("cambiapassword") || a.startsWith("nuovapassword") -> "ha cambiato la password di"
        v.nuova || a.startsWith("crea") -> "ha creato $cosa"
        else -> campiDaMostrare(v).singleOrNull()?.let { CAMPI_CON_ARTICOLO[chiaveCampo(it.campo)] }?.let { "ha cambiato $it di" }
            ?: "ha cambiato $cosa"
    }.trim()
}

/** "budget_euro", "budgetEuro" e "Budget euro" sono lo stesso campo. */
private fun chiaveCampo(c: String): String = Regex("([a-z])([A-Z])").replace(c, "$1 $2").replace('_', ' ').lowercase().trim()

/** I campi cambiati che dicono qualcosa: senza le date e i codici di servizio. */
private fun campiDaMostrare(v: VoceRegistro): List<eu.stgm.wisper.rapportino.CampoCambiato> =
    v.campi.filter { it.prima != it.dopo && chiaveCampo(it.campo) !in CAMPI_DI_SERVIZIO }

private val CAMPI_DI_SERVIZIO = setOf("modificato", "creato", "id", "soggetto id", "commessa id", "utente id", "ordine")

/** Il nome di un campo con il suo articolo, per la frase ("ha cambiato l'avanzamento di"). Gli altri restano generici. */
private val CAMPI_CON_ARTICOLO = mapOf(
    "avanzamento" to "l'avanzamento", "valore" to "il valore", "stato" to "lo stato", "nome" to "il nome",
    "descrizione" to "la descrizione", "note" to "le note", "budget euro" to "il budget", "budget ore" to "le ore previste",
    "importo contratto" to "l'importo del contratto", "prezzo orario" to "il prezzo orario", "costo orario" to "il costo orario",
    "costo fisso" to "il costo orario", "responsabile id" to "il responsabile", "fine prevista" to "la fine prevista",
    "inizio" to "l'inizio", "tariffa fissa" to "la tariffa", "ultima tariffa" to "la tariffa", "tariffa" to "la tariffa",
    "email" to "l'email", "telefono" to "il telefono", "partita iva" to "la partita IVA", "codice fiscale" to "il codice fiscale",
    "codice sdi" to "il codice SDI", "pec" to "la PEC", "indirizzo" to "l'indirizzo", "cap" to "il CAP", "citta" to "la città",
    "provincia" to "la provincia", "ruolo" to "il ruolo", "livello" to "il permesso", "formato" to "il formato",
    "rimborso km" to "il rimborso km", "sede id" to "la sede",
)

/** Il nome della cosa toccata: dal server se lo manda, altrimenti dalle anagrafiche, altrimenti il codice. */
private fun oggettoDi(v: VoceRegistro, ana: eu.stgm.wisper.rapportino.Anagrafiche): String {
    if (v.oggetto.isNotBlank()) return v.oggetto
    val id = v.idRiga
    return when (v.tabella) {
        "soggetti", "clienti", "fornitori" -> ana.soggetto(id)?.nome
        "commesse" -> ana.commessa(id)?.let { "${it.id} ${it.descrizione}".trim() }
        "prestazioni" -> ana.prestazioni.firstOrNull { it.id == id }?.nome
        "referenti" -> ana.referenti.firstOrNull { it.id == id }?.nome
        "sedi" -> ana.sede(id)?.nome
        "utenti" -> ana.utente(id)?.nome
        "permessi" -> id.substringBefore('.').let { Ruoli.nome(it) } + " · " + nomeModulo(id.substringAfter('.'))
        else -> null
    } ?: id
}

private fun fraseCompleta(v: VoceRegistro, ana: eu.stgm.wisper.rapportino.Anagrafiche): String =
    listOf(v.chi.ifBlank { "Qualcuno" }, fraseDi(v), oggettoDi(v, ana), v.coda).filter { it.isNotBlank() }.joinToString(" ") +
        if (v.nota.isNotBlank()) " (${v.nota})" else ""

/** "Oggi", "Ieri", "lunedì 20 ottobre". */
private fun nomeGiorno(d: LocalDate?): String {
    if (d == null) return "Senza data"
    val oggi = LocalDate.now()
    return when (d) {
        oggi -> "Oggi"
        oggi.minusDays(1) -> "Ieri"
        else -> d.format(DateTimeFormatter.ofPattern(if (d.year == oggi.year) "EEEE d MMMM" else "d MMMM yyyy", IT))
    }
}

/** "oggi alle 16:20", "ieri alle 17:40", "il 20 ottobre", "mai". */
internal fun quandoBreve(istante: String): String {
    val t = istanteLocale(istante) ?: return "mai"
    val oggi = LocalDate.now()
    val ora = t.format(DateTimeFormatter.ofPattern("H:mm"))
    return when (t.toLocalDate()) {
        oggi -> "oggi alle $ora"
        oggi.minusDays(1) -> "ieri alle $ora"
        else -> "il " + t.format(DateTimeFormatter.ofPattern(if (t.year == oggi.year) "d MMMM" else "d MMMM yyyy", IT))
    }
}

// ---------------------------------------------------------------------------------- copie

/** "Stanotte alle 2:30", "Oggi alle 11:05", "Ieri alle 2:30", "Il 18 ottobre alle 2:30". */
private fun quandoCopia(istante: String): String {
    val t = istanteLocale(istante) ?: return "Mai"
    val ora = t.format(DateTimeFormatter.ofPattern("H:mm"))
    val oggi = LocalDate.now()
    return when {
        t.toLocalDate() == oggi && t.hour < 6 -> "Stanotte alle $ora"
        t.toLocalDate() == oggi -> "Oggi alle $ora"
        t.toLocalDate() == oggi.minusDays(1) -> "Ieri alle $ora"
        else -> "Il " + t.format(DateTimeFormatter.ofPattern("d MMMM", IT)) + " alle $ora"
    }
}

@Composable
private fun PaginaCopie(dati: Dati, puo: Boolean, onIndietro: () -> Unit) {
    val c = W.colori
    val ctx = LocalContext.current
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    var giro by remember { mutableIntStateOf(0) }
    val lettura = rememberLettura(Unit, giro) { dati.copie() }
    var copio by remember { mutableStateOf(false) }
    var esporto by remember { mutableStateOf<String?>(null) }

    fun copiaAdesso() {
        if (copio) return
        copio = true
        scope.launch {
            dati.copiaAdesso().onSuccess { avvisi.mostra("Copia fatta adesso"); giro++ }.onFailure { avvisi.mostra(it.message ?: "La copia non è riuscita: riprova") }
            copio = false
        }
    }

    Column(
        Modifier.fillMaxSize().background(c.fondo).verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = 40.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Testata(onIndietro = onIndietro)
        TitoloPagina("Copie ed esportazioni")
        when (lettura) {
            is Lettura.Pronta -> {
                val u = lettura.dato.ultima
                if (u == null || u.riuscita) {
                    Scheda(orizzontale = 18.dp, verticale = 18.dp, raggio = 22.dp, spazio = 6.dp) {
                        Etichetta("Ultima copia")
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Icon(Icone.scudo, null, tint = if (u != null) c.firmatoTesto else c.tenue, modifier = Modifier.size(22.dp))
                            Text(u?.let { quandoCopia(it.quando) } ?: "Ancora nessuna copia", style = Testi.titoloSezione.copy(fontSize = 20.sp), color = c.testo)
                        }
                        val dove = listOfNotNull(u?.dove?.takeIf { it.isNotBlank() }, if (lettura.dato.foglioAggiornato) "il foglio è aggiornato" else null).joinToString(" · ")
                        if (dove.isNotBlank()) Text(dove, style = Testi.secondarioGrande, color = c.tenue)
                    }
                } else {
                    Column(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(c.rossoTenue).padding(18.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Etichetta("Ultima copia")
                        Text("Non è riuscita · " + quandoCopia(u.quando).replaceFirstChar { it.lowercase() }, style = Testi.forteGrande, color = c.rossoTesto)
                        if (u.dove.isNotBlank()) Text(u.dove, style = Testi.secondarioGrande, color = c.testo2)
                        if (puo) PulsanteBordo("Riprova", { copiaAdesso() }, icona = Icone.riapri, altezza = 44.dp)
                    }
                }
                if (puo) PulsanteBordo(if (copio) "Copio…" else "Fai una copia adesso", { copiaAdesso() }, Modifier.fillMaxWidth(), icona = Icone.scudo, altezza = 48.dp)
                if (lettura.dato.elenco.isNotEmpty()) {
                    Etichetta("Copie")
                    Scheda(orizzontale = 18.dp, verticale = 0.dp, raggio = 22.dp, spazio = 0.dp) {
                        lettura.dato.elenco.take(10).forEachIndexed { i, k ->
                            if (i > 0) LineaElenco()
                            RigaCopia(k)
                        }
                    }
                }
            }
            else -> StatoLettura(lettura) { giro++ }
        }
        Etichetta("Esporta per Excel")
        Scheda(orizzontale = 18.dp, verticale = 0.dp, raggio = 22.dp, spazio = 0.dp) {
            val perm = LocalPermessi.current
            (listOf("rapportini" to "Rapportini", "clienti" to "Clienti e fornitori", "commesse" to "Commesse") +
                (if (perm.vede(Moduli.PREVENTIVI)) listOf("preventivi" to "Preventivi") else emptyList()) +
                (if (perm.vede(Moduli.ATTIVITA)) listOf("attivita" to "Attività") else emptyList())).forEachIndexed { i, (cosa, nome) ->
                if (i > 0) LineaElenco()
                RigaVoce(
                    nome, sotto = if (esporto == cosa) "Preparo il file…" else "Un file che Excel apre così com'è", icona = Icone.scarica, freccia = false,
                    onClick = {
                        if (esporto != null) return@RigaVoce
                        esporto = cosa
                        scope.launch {
                            dati.esporta(cosa)
                                .onSuccess { f -> Stampa.condividi(ctx, f, "$nome per Excel", "text/csv") }
                                .onFailure { avvisi.mostra(it.message ?: "Il file non è pronto: riprova") }
                            esporto = null
                        }
                    },
                )
            }
        }
    }
}

@Composable
private fun RigaCopia(k: CopiaSicurezza) {
    val c = W.colori
    Row(Modifier.fillMaxWidth().heightIn(min = 56.dp).padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(quandoCopia(k.quando), style = Testi.forte.copy(fontWeight = FontWeight.Bold), color = if (k.riuscita) c.testo else c.rossoTesto, modifier = Modifier.weight(1f))
        Text(
            if (!k.riuscita) "non riuscita" else if (k.byte > 0) Numeri.scrivi(Math.round(k.byte / 100_000.0) / 10.0) + " MB" else "",
            style = Testi.secondario, color = c.tenue,
        )
    }
}

// ---------------------------------------------------------------------------------- cestino

@Composable
private fun PaginaCestino(dati: Dati, puo: Boolean, onIndietro: () -> Unit) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    var giro by remember { mutableIntStateOf(0) }
    val lettura = rememberLettura(Unit, giro) { dati.cestino() }
    Column(
        Modifier.fillMaxSize().background(c.fondo).verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = 40.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Testata(onIndietro = onIndietro)
        TitoloPagina("Cestino")
        when (lettura) {
            is Lettura.Pronta -> {
                if (lettura.dato.isEmpty()) Text("Il cestino è vuoto.", style = Testi.secondarioGrande, color = c.tenue, modifier = Modifier.fillMaxWidth().padding(vertical = 20.dp), textAlign = TextAlign.Center)
                else Scheda(orizzontale = 18.dp, verticale = 0.dp, raggio = 22.dp, spazio = 0.dp) {
                    lettura.dato.forEachIndexed { i, f ->
                        if (i > 0) LineaElenco()
                        RigaVoce(
                            f.nome,
                            sotto = listOf(f.daDove.takeIf { it.isNotBlank() }?.let { "da $it" }, f.quando.takeIf { it.isNotBlank() }?.let { quandoBreve(it) })
                                .filterNotNull().joinToString(" · ").ifBlank { null },
                            icona = if (f.nome.substringAfterLast('.').lowercase() in setOf("jpg", "jpeg", "png", "webp")) Icone.galleria else Icone.pdf,
                            fine = if (puo) ({
                                PulsanteTesto("Ripristina", {
                                    ambitoAmm.launch {
                                        dati.ripristinaFile(f.id).onSuccess { avvisi.mostra("Ripristinato ${f.nome}"); giro++ }
                                            .onFailure { avvisi.mostra(it.message ?: "Non è stato ripristinato: riprova") }
                                    }
                                })
                            }) else null,
                            freccia = false,
                        )
                    }
                }
            }
            else -> StatoLettura(lettura) { giro++ }
        }
    }
}

// ---------------------------------------------------------------------------------- il foglio "Tu"

/**
 * Il foglio che si apre dal cerchio con le iniziali: chi sei, L'app (tema,
 * visita, versione: per tutti), Cambia la password, Esci.
 */
@Composable
fun FoglioTu(dati: Dati, onChiudi: () -> Unit, onApp: () -> Unit, onUscito: () -> Unit, modoIniziale: String = "") {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    val sessione by dati.sessione.collectAsStateWithLifecycle()
    val u = sessione.utente
    // "esci" quando si arriva da Esci in fondo al menu: si chiede subito la conferma.
    var modo by remember { mutableStateOf(modoIniziale) }
    var attuale by remember { mutableStateOf("") }
    var nuova by remember { mutableStateOf("") }
    var errore by remember { mutableStateOf<String?>(null) }
    var lavoro by remember { mutableStateOf(false) }

    FoglioDalBasso(onChiudi) {
        when (modo) {
            "password" -> {
                Text("Cambia la password", style = Testi.titoloScheda, color = c.testo)
                CampoPassword(attuale, { attuale = it; errore = null }, "Password di adesso", Modifier.fillMaxWidth())
                CampoPassword(nuova, { nuova = it; errore = null }, "Password nuova", Modifier.fillMaxWidth(), errore = if (nuova.isNotEmpty() && nuova.length < 8) "Almeno 8 caratteri" else null)
                errore?.let { Text(it, style = Testi.secondario, color = c.rossoTesto) }
                PulsantePrincipale(if (lavoro) "Cambio…" else "Cambia la password", {
                    if (lavoro || attuale.isBlank() || nuova.length < 8) { if (attuale.isBlank()) errore = "Scrivi la password di adesso"; return@PulsantePrincipale }
                    lavoro = true
                    scope.launch {
                        dati.cambiaPassword(attuale, nuova)
                            .onSuccess { avvisi.mostra("Password cambiata"); onChiudi() }
                            .onFailure { errore = it.message ?: "La password non è cambiata: riprova" }
                        lavoro = false
                    }
                }, altezza = 56.dp, abilitato = !lavoro)
                PulsanteTesto("Annulla", { modo = "" }, Modifier.fillMaxWidth(), colore = c.testo)
            }
            "esci" -> {
                Text("Uscire da Wisper su questo telefono?", style = Testi.titoloScheda, color = c.testo)
                Text("I rapportini che non sono ancora partiti restano qui e partono dopo il prossimo accesso.", style = Testi.testo, color = c.testo2)
                errore?.let { Text(it, style = Testi.secondario, color = c.rossoTesto) }
                PulsantePrincipale(if (lavoro) "Esco…" else "Esci", {
                    if (lavoro) return@PulsantePrincipale
                    lavoro = true
                    scope.launch {
                        dati.esci().onSuccess { onUscito() }.onFailure { errore = it.message ?: "Non riesco a uscire: riprova" }
                        lavoro = false
                    }
                }, altezza = 56.dp, abilitato = !lavoro)
                PulsanteTesto("Annulla", { modo = ""; errore = null }, Modifier.fillMaxWidth(), colore = c.testo)
            }
            else -> {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                    CerchioPersona(u.iniziali, 56.dp)
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(u.nome.ifBlank { "Wisper" }, style = Testi.titoloScheda, color = c.testo, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        Text(listOf(Ruoli.nome(u.ruolo), u.email).filter { it.isNotBlank() }.joinToString(" · "), style = Testi.secondarioGrande, color = c.tenue)
                    }
                }
                Spacer(Modifier.height(4.dp))
                VoceMenu(Icone.amministrazione, "L'app", onApp)
                VoceMenu(Icone.lucchetto, "Cambia la password", { modo = "password" })
                VoceMenu(Icone.esci, "Esci", { modo = "esci" })
            }
        }
    }
}

/** La password col pulsante dell'occhio per vederla. */
@Composable
internal fun CampoPassword(
    valore: String,
    onCambia: (String) -> Unit,
    etichetta: String,
    modifier: Modifier = Modifier,
    errore: String? = null,
    azione: ImeAction = ImeAction.Done,
    onAzione: () -> Unit = {},
) {
    val c = W.colori
    var vedi by remember { mutableStateOf(false) }
    Column(modifier, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(etichetta, style = Testi.secondarioGrande.copy(fontWeight = FontWeight.Bold), color = c.testo)
        BasicTextField(
            value = valore, onValueChange = onCambia, singleLine = true,
            textStyle = Testi.testoGrande.copy(color = c.testo), cursorBrush = SolidColor(c.testo),
            visualTransformation = if (vedi) VisualTransformation.None else PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = azione),
            keyboardActions = KeyboardActions(onDone = { onAzione() }, onGo = { onAzione() }, onNext = { onAzione() }),
            decorationBox = { campo ->
                Row(
                    Modifier.fillMaxWidth().heightIn(min = 56.dp).clip(RoundedCornerShape(16.dp)).background(c.scheda)
                        .border(1.5.dp, if (errore != null) c.rossoPieno else c.bordoCampo, RoundedCornerShape(16.dp))
                        .padding(start = 16.dp, end = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(Modifier.weight(1f)) { campo() }
                    Box(
                        Modifier.size(48.dp).clip(CircleShape).clickable { vedi = !vedi }
                            .semantics { contentDescription = if (vedi) "Nascondi la password" else "Mostra la password"; role = Role.Button },
                        contentAlignment = Alignment.Center,
                    ) { Icon(if (vedi) Icone.occhioChiuso else Icone.occhio, null, tint = c.tenue, modifier = Modifier.size(22.dp)) }
                }
            },
        )
        if (errore != null) Text(errore, style = Testi.secondario, color = c.rossoTesto)
    }
}
