package eu.stgm.wisper.ui

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
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
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import eu.stgm.wisper.Dati
import eu.stgm.wisper.rapportino.CodiceCommessa
import eu.stgm.wisper.rapportino.Collegamento
import eu.stgm.wisper.rapportino.ColonnaImport
import eu.stgm.wisper.rapportino.ControlloImport
import eu.stgm.wisper.rapportino.CopieERipristino
import eu.stgm.wisper.rapportino.Esportazione
import eu.stgm.wisper.rapportino.FormatoCommessa
import eu.stgm.wisper.rapportino.Funzione
import eu.stgm.wisper.rapportino.GruppoImpostazioni
import eu.stgm.wisper.rapportino.Importazione
import eu.stgm.wisper.rapportino.LetturaImport
import eu.stgm.wisper.rapportino.Moduli
import eu.stgm.wisper.rapportino.Numerazione
import eu.stgm.wisper.rapportino.Numeri
import eu.stgm.wisper.rapportino.Parole8
import eu.stgm.wisper.rapportino.PonteServer
import eu.stgm.wisper.rapportino.PreferenzeNotifiche
import eu.stgm.wisper.rapportino.RigaControllo
import eu.stgm.wisper.rapportino.Ruoli
import eu.stgm.wisper.rapportino.StatoCambio
import eu.stgm.wisper.rapportino.Stampa
import eu.stgm.wisper.rapportino.Testi8
import eu.stgm.wisper.rapportino.istanteLocale
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.time.LocalDate
import java.time.format.DateTimeFormatter

/*
 * 18 Amministrazione completa sul telefono (fase8.md §9, §11, §15.1): l'elenco in cinque
 * gruppi e le pagine nuove (Funzioni accese, Impostazioni generali, Notifiche, Sicurezza,
 * Copie e ripristino, Importa ed esporta, Importa clienti e fornitori, Stato del sistema,
 * Lista di controllo, il codice delle commesse). Chi ha Amministrazione in lettura vede
 * tutto senza i pulsanti per cambiare (fase 1).
 */

/** Il file arrivato dal Condividi per Importa clienti e fornitori (nome e byte). */
object FileImport {
    val arrivato = MutableStateFlow<Pair<String, ByteArray>?>(null)

    /** Un CSV o un Excel (dal nome o dal tipo). */
    fun accettato(nome: String, tipo: String?): Boolean {
        val n = nome.lowercase()
        val t = tipo.orEmpty().lowercase()
        return n.endsWith(".csv") || n.endsWith(".xlsx") || t == "text/csv" || t == "text/comma-separated-values" || t == "application/csv" ||
            t == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    }
}

// ---------------------------------------------------------------------------------- l'elenco a gruppi (§9.2)

private class VoceAmm8(val titolo: String, val stato: String, val icona: androidx.compose.ui.graphics.vector.ImageVector, val apri: () -> Unit, val tinta: String? = null)

@Composable
internal fun ElencoAmministrazione8(dati: Dati, nav: Navigatore) {
    val c = W.colori
    val perm = LocalPermessi.current
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    val sessione by dati.sessione.collectAsStateWithLifecycle()
    val dashboard by dati.dashboard.collectAsStateWithLifecycle()
    val g = Giri8.amministrazione
    // Le righe di stato si leggono una per una: se una non risponde, la riga dice cosa c'è dentro.
    val funzioni = rememberLettura("funzioni", g) { dati.fase8.funzioni() }
    val sicurezza = rememberLettura("sicurezza", g) { dati.fase8.sicurezza() }
    val impostazioni = rememberLettura("impostazioni", g) { dati.fase8.impostazioniGenerali() }
    val copie = rememberLettura("copie8", g) { dati.fase8.copie() }
    val stato = rememberLettura("stato", g) { dati.fase8.statoSistema() }
    val controlli = rememberLettura("controlli", g) { dati.fase8.controlliFinali() }
    fun <T> pronto(l: Lettura<T>): T? = (l as? Lettura.Pronta)?.dato

    val anno = LocalDate.now().year
    val prossimaCommessa = ana.numerazione("commessa")?.prossimoNumero(anno) ?: ana.prossimoCodiceCommessa(anno)
    val errori = dashboard?.integrazioniErrore
    val vai = { r: String -> nav.vai("amm/$r") }
    val sic = pronto(sicurezza)
    val gruppi = listOf(
        "Lo studio" to listOfNotNull(
            VoceAmm8("Dati dello studio", listOf(ana.impostazione("RAGIONE_SOCIALE").ifBlank { "Lo studio" }, if (ana.impostazione("STUDIO_LOGO").isNotBlank()) "logo sui PDF" else "").filter { it.isNotBlank() }.joinToString(" · "), Icone.immagine, { vai("studio") }),
            VoceAmm8("Aspetto", "Tema, visita guidata, versione", Icone.pennello, { vai("aspetto") }),
            VoceAmm8("Funzioni accese", pronto(funzioni)?.let { Funzione.riassunto(it) }?.ifBlank { null } ?: "Le parti che lo studio usa", Icone.interruttore, { vai("funzioni") }),
        ),
        "Persone e accessi" to listOfNotNull(
            VoceAmm8("Utenti", if (ana.utenti.isEmpty()) "Chi entra in Wisper e con quale ruolo" else Testi8.quanti(ana.utenti.count { it.attivo }, "attivo", "attivi"), Icone.clienti, { vai("utenti") }),
            VoceAmm8("Ruoli e permessi", "Quattro ruoli più l'esterno", Icone.lucchetto, { vai("permessi") }),
            VoceAmm8("Sicurezza", sic?.riassunto ?: "Accessi, dispositivi, copia cifrata", Icone.scudo, { vai("sicurezza") }, tinta = sic?.let { if (it.tuttoAPosto) "verde" else "rosso" }),
            VoceAmm8("Notifiche", ana.impostazione("EMAIL_AVVISI").takeIf { it.isNotBlank() }?.let { "Avvisi del server a $it" } ?: "Le tue notifiche e gli avvisi del server", Icone.campanella, { vai("notifiche") }),
        ),
        "Regole" to listOfNotNull(
            VoceAmm8("Impostazioni generali", pronto(impostazioni)?.let { l -> "${l.sumOf { it.voci.size }} impostazioni in ${l.size} gruppi" } ?: "Tutte le regole in un posto", Icone.amministrazione, { vai("impostazioni") }),
            VoceAmm8(
                "Impostazioni fiscali",
                if (eu.stgm.wisper.rapportino.RegoleFiscali.da(ana.impostazioni).confermate) "Confermate dal commercialista" else "Da confermare col commercialista",
                Icone.fatturazione, { vai("fiscale") },
            ).takeIf { perm.vede(Moduli.FATTURAZIONE) },
            VoceAmm8("Numerazioni", "Prossima commessa $prossimaCommessa", Icone.numero, { vai("numerazioni") }),
            VoceAmm8("Categorie dei documenti", "Approvazione, chi le vede, scadenza proposta", Icone.documento, { vai("categorie") }).takeIf { perm.vede(Moduli.DOCUMENTI) },
            VoceAmm8("Tipi di formazione", "PES, PAV, PEI, primo soccorso", Icone.formazione, { vai("formazione") }).takeIf { perm.vede(Moduli.PERSONE) },
            VoceAmm8("Veicoli e rimborso km", "Il veicolo, il suo €/km, le tabelle ACI", Icone.auto, { vai("veicoli") }).takeIf { perm.vede(Moduli.SPESE) },
        ),
        "Dati" to listOfNotNull(
            VoceAmm8("Copie e ripristino", pronto(copie)?.let { k ->
                listOfNotNull(k.copie.ultima?.let { u -> if (u.riuscita) quandoCopia8(u.quando) else "L'ultima copia non è riuscita" },
                    k.ultimaAutomatica?.takeIf { it.ok }?.let { "provata il " + dataCorta(it.quando) }).joinToString(" · ")
            }?.ifBlank { null } ?: "Copie di sicurezza e ripristino provato", Icone.disco, { vai("copie") }),
            VoceAmm8("Importa ed esporta", "Clienti da un file, tutti i dati in uno ZIP", Icone.importa, { vai("importa") }),
            VoceAmm8("Registro attività", "Chi ha cambiato cosa", Icone.storia, { vai("registro") }),
            VoceAmm8("Cestino", "File tolti, recuperabili", Icone.cestino, { vai("cestino") }),
            VoceAmm8("Spazio sul NAS", "Dove va lo spazio, copia fuori casa", Icone.disco, { vai("spazio") }),
        ),
        "Sistema" to listOfNotNull(
            VoceAmm8("Stato del sistema", pronto(stato)?.let { s -> listOf("Server " + s.versione, s.accesoDa().takeIf { it.isNotBlank() }?.let { "acceso da $it" }).filterNotNull().joinToString(" · ") } ?: "Il server sta bene?", Icone.server, { vai("stato") }),
            VoceAmm8("Integrazioni", errori?.let { if (it == 0) "Nessuno in Errore" else Testi8.quanti(it, "collegamento in Errore", "collegamenti in Errore") } ?: "Lo stato vero di ogni collegamento", Icone.spina,
                { nav.sezione(Sezione.INTEGRAZIONI) }, tinta = errori?.let { if (it > 0) "rosso" else null }).takeIf { perm.vede(Moduli.INTEGRAZIONI) && Moduli.INTEGRAZIONI !in sessione.interfaccia.funzioniSpente },
            VoceAmm8("Lista di controllo", pronto(controlli)?.let { "${it.fatti} di ${it.totale} fatti" } ?: "Il gestionale è completo?", Icone.controlli, { vai("controlli") }),
        ),
    )
    Column(
        Modifier.fillMaxSize().background(c.fondo).verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = 40.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Testata(onIndietro = { nav.indietro() })
        TitoloPagina("Amministrazione")
        gruppi.forEach { (nome, voci) ->
            if (voci.isNotEmpty()) Sezione5(nome) {
                SchedaElenco {
                    voci.forEachIndexed { i, v ->
                        if (i > 0) LineaElenco()
                        if (v.tinta != null) RigaVoce(v.titolo, sotto = v.stato, inizio = { IconaTinta(v.icona, v.tinta) }, onClick = v.apri)
                        else RigaVoce(v.titolo, sotto = v.stato, icona = v.icona, onClick = v.apri)
                    }
                }
            }
        }
    }
}

/** "Stanotte alle 2:30", "Oggi alle 10:05", "Ieri alle 2:30", "Il 1 ottobre alle 2:30". */
internal fun quandoCopia8(istante: String): String {
    val t = istanteLocale(istante) ?: return "Mai"
    val ora = t.format(DateTimeFormatter.ofPattern("H:mm"))
    val oggi = LocalDate.now()
    return when {
        t.toLocalDate() == oggi && t.hour < 6 -> "Stanotte alle $ora"
        t.toLocalDate() == oggi -> "Oggi alle $ora"
        t.toLocalDate() == oggi.minusDays(1) -> "Ieri alle $ora"
        else -> "Il " + t.format(DateTimeFormatter.ofPattern("d MMMM", ITALIA)) + " alle $ora"
    }
}

/** "01/10". */
internal fun dataCorta(istante: String): String = istanteLocale(istante)?.format(DateTimeFormatter.ofPattern("dd/MM")) ?: runCatching { LocalDate.parse(istante.take(10)).format(DateTimeFormatter.ofPattern("dd/MM")) }.getOrDefault("")

// ---------------------------------------------------------------------------------- Funzioni accese (§9.5)

@Composable
internal fun PaginaFunzioni(dati: Dati, onIndietro: () -> Unit) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    val sessione by dati.sessione.collectAsStateWithLifecycle()
    val titolare = sessione.utente.ruolo == Ruoli.TITOLARE
    var giro by remember { mutableStateOf(0) }
    val lettura = rememberLettura(Unit, giro + Giri8.amministrazione * 1000) { dati.fase8.funzioni() }
    var spegni by remember { mutableStateOf<Funzione?>(null) }
    var lavoro by remember { mutableStateOf<String?>(null) }

    fun salva(f: Funzione, accesa: Boolean) {
        if (lavoro != null) return
        lavoro = f.modulo
        scope.launch {
            dati.fase8.salvaFunzioni(f.modulo, accesa)
                .onSuccess { avvisi.mostra((if (accesa) "Accesa: " else "Spenta: ") + f.nome); giro++; Giri8.amministrazione++ }
                .onFailure { avvisi.mostra(spiegaErrore2(it, "Non è cambiata: riprova")) }
            lavoro = null
        }
    }

    Column(
        Modifier.fillMaxSize().background(c.fondo).verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = 40.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Testata(onIndietro = onIndietro)
        TitoloPagina("Funzioni accese")
        when (lettura) {
            is Lettura.Pronta -> SchedaElenco {
                lettura.dato.forEachIndexed { i, f ->
                    if (i > 0) LineaElenco()
                    Row(Modifier.fillMaxWidth().heightIn(min = 64.dp).padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text(f.nome, style = Testi.forte, color = c.testo)
                            if (f.spegnibile) Text(primaFrase(f.cosaCambia), style = Testi.secondario, color = c.tenue)
                        }
                        when {
                            !f.spegnibile -> Parola8("Sempre accesa")
                            titolare -> Box(Modifier.bersaglio("funzione-" + f.modulo)) {
                                Interruttore(f.accesa, { nuova -> if (nuova) salva(f, true) else spegni = f }, f.nome)
                            }
                            else -> Parola8(f.parola)
                        }
                    }
                }
            }
            else -> StatoLettura(lettura) { giro++ }
        }
    }
    spegni?.let { f ->
        FoglioDalBasso({ spegni = null }) {
            Text("Spegnere ${f.nome}?", style = Testi.titoloScheda, color = c.testo)
            Text(dopoDomanda(f.cosaCambia).ifBlank { "Sparisce dal menu di tutti. I dati restano." }, style = Testi.testo, color = c.testo2)
            PulsantePericolo("Spegni", { spegni = null; salva(f, false) }, Modifier.fillMaxWidth().bersaglio("conferma-spegni"))
            PulsanteTesto("Annulla", { spegni = null }, Modifier.fillMaxWidth(), colore = c.testo)
        }
    }
}

/** "Spegnere Mezzi? Sparisce dal menu di tutti. Nei rapportini…" → "Sparisce dal menu di tutti. Nei rapportini…". */
private fun dopoDomanda(t: String): String = if (t.trimStart().startsWith("Spegnere") && t.contains("?")) t.substringAfter("?").trim() else t.trim()

/** La prima frase di cosa cambia, per la riga. */
private fun primaFrase(t: String): String = dopoDomanda(t).let { s -> s.substringBefore(". ").let { if (it.length < s.length) "$it." else it } }

// ---------------------------------------------------------------------------------- Impostazioni generali (§9.4)

@Composable
internal fun PaginaImpostazioniGenerali(dati: Dati, nav: Navigatore, onIndietro: () -> Unit) {
    val c = W.colori
    val puo = scriveAmministrazione()
    var giro by remember { mutableStateOf(0) }
    val lettura = rememberLettura(Unit, giro + Giri8.amministrazione * 1000) { dati.fase8.impostazioniGenerali() }
    var cerca by remember { mutableStateOf("") }
    val aperte = remember { mutableStateMapOf<String, Boolean>() }

    Column(
        Modifier.fillMaxSize().background(c.fondo).verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = 40.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Testata(onIndietro = onIndietro)
        TitoloPagina("Impostazioni generali")
        CampoCerca(cerca, { cerca = it }, "Cerca un'impostazione")
        when (lettura) {
            is Lettura.Pronta -> {
                val gruppi = GruppoImpostazioni.filtra(lettura.dato, cerca)
                if (gruppi.isEmpty()) RigaCalma("Nessuna impostazione con queste parole.")
                gruppi.forEach { g ->
                    val aperta = cerca.isNotBlank() || aperte[g.chiave] == true
                    SchedaImpostazioni(dati, nav, g, aperta, puo, onApri = { aperte[g.chiave] = !aperta }) { giro++ }
                }
            }
            else -> StatoLettura(lettura) { giro++ }
        }
    }
}

/** Una scheda richiudibile di Impostazioni generali, col suo Salva col bordo (nessun giallo, §9.4). */
@Composable
private fun SchedaImpostazioni(dati: Dati, nav: Navigatore, g: GruppoImpostazioni, aperta: Boolean, puo: Boolean, onApri: () -> Unit, onSalvato: () -> Unit) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    val modifica = remember(g) { ModificaImpostazioni(g.voci) }
    var salvo by remember { mutableStateOf(false) }
    var spegniPortale by remember { mutableStateOf(false) }
    if (spegniPortale) FoglioConferma(
        "Spegnere il portale adesso?", "I clienti non entrano più finché non lo riaccendi. I dati restano.", "Spegni il portale",
        onConferma = {
            spegniPortale = false
            scope.launch { dati.fase7.spegni(true).onSuccess { avvisi.mostra("Portale spento"); onSalvato() }.onFailure { avvisi.mostra(spiegaErrore2(it, "Il portale non si è spento: riprova")) } }
        },
        onAnnulla = { spegniPortale = false }, pericolo = true,
    )
    Scheda(orizzontale = 18.dp, verticale = 6.dp, spazio = 10.dp) {
        Row(
            Modifier.fillMaxWidth().heightIn(min = 52.dp).clickable(onClick = onApri).semantics { role = Role.Button },
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(g.nome, style = Testi.titoloSezione, color = c.testo, modifier = Modifier.weight(1f))
            Text(if (aperta) "" else Testi8.quanti(g.voci.size + g.collegamenti.size, "voce", "voci"), style = Testi.secondario, color = c.tenue)
            Icon(if (aperta) Icone.su else Icone.giu, null, tint = c.tenue, modifier = Modifier.padding(start = 8.dp).size(20.dp))
        }
        if (aperta) {
            modifica.Campi(abilitato = { puo })
            g.collegamenti.forEach { col ->
                LineaElenco()
                RigaVoce(col.nome, sotto = col.valore.ifBlank { null }, onClick = { apriCollegamentoImpostazione(col.pagina, col.sezione, nav, dati) })
            }
            // Spegni il portale adesso (fase 7 §3.1), che dalla fase 8 sta nella scheda Portale clienti (§9.4).
            g.azioni.filter { it.second == "spegniPortale" }.forEach { (nome, _) ->
                if (LocalPermessi.current.modifica(Moduli.PORTALE)) PulsantePericolo(nome, { spegniPortale = true }, Modifier.fillMaxWidth())
            }
            val errori = modifica.errori()
            errori.firstOrNull()?.let { Text(it, style = Testi.secondario, color = c.rossoTesto) }
            if (puo && g.salvabile) PulsanteBordo(if (salvo) "Salvo…" else "Salva", {
                if (salvo || errori.isNotEmpty()) return@PulsanteBordo
                salvo = true
                scope.launch {
                    val valori = modifica.valori()
                    if (valori.isEmpty()) { avvisi.mostra("Non hai cambiato niente"); salvo = false; return@launch }
                    dati.fase8.salvaImpostazioni(valori)
                        .onSuccess {
                            avvisi.mostra(if (g.chiave in setOf("lavoro", "rimborsi")) "Fatto. Vale per le cose nuove: quelle già scritte restano come sono" else "Salvato")
                            onSalvato()
                        }
                        .onFailure { avvisi.mostra(spiegaErrore2(it, "Non è stato salvato: riprova")) }
                    salvo = false
                }
            }, Modifier.fillMaxWidth().padding(bottom = 10.dp))
            else Box(Modifier.height(6.dp))
        }
    }
}

/** Dove porta una riga collegata delle impostazioni (Impostazioni fiscali, Veicoli, Conti, Modelli, Spegni il portale). */
internal fun apriCollegamentoImpostazione(pagina: String, sezione: String, nav: Navigatore, dati: Dati) {
    when (pagina) {
        "amministrazione" -> nav.vai("amm/" + sezione.ifBlank { "studio" })
        "documenti" -> { RicordoDocumenti.mostra(if (sezione == "modelli") "modelli" else sezione); nav.sezione(Sezione.DOCUMENTI) }
        "banche" -> apriCollegamento(Collegamento(sezione.ifBlank { "conti" }), nav, dati.viste.value.map { it.rapportino })
        else -> apriCollegamento(Collegamento(pagina, parametri = if (sezione.isNotBlank()) mapOf("sezione" to sezione) else emptyMap()), nav, dati.viste.value.map { it.rapportino })
    }
}

// ---------------------------------------------------------------------------------- Notifiche (§9.7)

@Composable
internal fun PaginaNotifiche(dati: Dati, perLoStudio: Boolean, onIndietro: () -> Unit) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    val amm2 = scriveAmministrazione()
    var giro by remember { mutableStateOf(0) }
    val lettura = rememberLettura(Unit, giro) { dati.fase8.notifichePreferenze() }
    var telefono by remember { mutableStateOf<Boolean?>(null) }
    var silenzio by remember { mutableStateOf<Boolean?>(null) }
    val tipi = remember { mutableStateMapOf<String, Boolean>() }
    var salvo by remember { mutableStateOf(false) }
    var email by remember(ana.impostazione("EMAIL_AVVISI")) { mutableStateOf(ana.impostazione("EMAIL_AVVISI")) }
    var ora by remember(ana.impostazione("NOTIFICHE_ORA")) { mutableStateOf(ana.impostazione("NOTIFICHE_ORA").ifBlank { "08:00" }) }
    var provo by remember { mutableStateOf(false) }
    var salvoStudio by remember { mutableStateOf(false) }

    Column(
        Modifier.fillMaxSize().background(c.fondo).verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = 40.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Testata(onIndietro = onIndietro)
        TitoloPagina("Notifiche")
        when (lettura) {
            is Lettura.Pronta -> {
                val p: PreferenzeNotifiche = lettura.dato
                Scheda(orizzontale = 18.dp, verticale = 16.dp, spazio = 6.dp) {
                    Text("Le tue notifiche", style = Testi.titoloSezione, color = c.testo)
                    RigaInterruttore("Avvisami sul telefono", telefono ?: p.telefono) { telefono = it }
                    Row(Modifier.fillMaxWidth().heightIn(min = 56.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text("Di sera e nei festivi niente avvisi sul telefono", style = Testi.forte, color = c.testo)
                            Text("Dalle 20 alle 7: restano nella campanella", style = Testi.secondario, color = c.tenue)
                        }
                        Interruttore(silenzio ?: p.silenzioSera, { silenzio = it }, "Di sera e nei festivi niente avvisi sul telefono")
                    }
                    PreferenzeNotifiche.gruppiDi(p.tipi).forEach { (gruppo, voci) ->
                        Etichetta(gruppo, Modifier.padding(top = 8.dp))
                        voci.forEach { (k, nome) -> RigaInterruttore(nome, tipi[k] ?: p.tipi[k] ?: true) { tipi[k] = it } }
                    }
                    PulsanteBordo(if (salvo) "Salvo…" else "Salva", {
                        if (salvo) return@PulsanteBordo
                        salvo = true
                        scope.launch {
                            dati.fase8.salvaNotifichePreferenze(telefono, silenzio, p.tipi + tipi)
                                .onSuccess { avvisi.mostra("Salvato") }
                                .onFailure { avvisi.mostra(spiegaErrore2(it, "Non è stato salvato: riprova")) }
                            salvo = false
                        }
                    }, Modifier.fillMaxWidth().padding(top = 8.dp))
                }
            }
            else -> StatoLettura(lettura) { giro++ }
        }
        // Per lo studio (solo Amministrazione: Modifica): a chi vanno gli avvisi del server, l'ora del riepilogo.
        if (perLoStudio && amm2) Scheda(orizzontale = 18.dp, verticale = 16.dp) {
            Text("Per lo studio", style = Testi.titoloSezione, color = c.testo)
            CampoTesto(email, { email = it }, "Avvisi del server a", Modifier.fillMaxWidth(), tastiera = KeyboardType.Email)
            CampoTesto(ora, { ora = it }, "Ora del riepilogo del mattino", Modifier.fillMaxWidth(), tastiera = KeyboardType.Number)
            PulsanteBordo(if (provo) "Mando…" else "Manda una prova", {
                if (provo) return@PulsanteBordo
                provo = true
                scope.launch {
                    dati.fase8.provaAvvisi()
                        .onSuccess { a -> avvisi.mostra(if (a.isEmpty()) "Prova degli avvisi mandata" else "Prova degli avvisi mandata a " + a.joinToString(", ")) }
                        .onFailure { avvisi.mostra(spiegaErrore2(it, "La prova non è partita: riprova")) }
                    provo = false
                }
            }, Modifier.fillMaxWidth())
            PulsanteBordo(if (salvoStudio) "Salvo…" else "Salva", {
                if (salvoStudio) return@PulsanteBordo
                if (!Regex("""^([01]?\d|2[0-3])[:.][0-5]\d$""").matches(ora.trim())) { avvisi.mostra("Ora del riepilogo: scrivila come 8:00"); return@PulsanteBordo }
                salvoStudio = true
                val o = ora.trim().replace('.', ':').let { if (it.length == 4) "0$it" else it }
                scope.launch {
                    dati.fase8.salvaImpostazioni(mapOf("EMAIL_AVVISI" to email.trim(), "NOTIFICHE_ORA" to o))
                        .onSuccess { avvisi.mostra("Salvato") }
                        .onFailure { avvisi.mostra(spiegaErrore2(it, "Non è stato salvato: riprova")) }
                    salvoStudio = false
                }
            }, Modifier.fillMaxWidth())
        }
    }
}

// ---------------------------------------------------------------------------------- Sicurezza (§9.8)

@Composable
internal fun PaginaSicurezza(dati: Dati, nav: Navigatore, onIndietro: () -> Unit) {
    val c = W.colori
    val ctx = LocalContext.current
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    val sessione by dati.sessione.collectAsStateWithLifecycle()
    val titolare = sessione.utente.ruolo == Ruoli.TITOLARE
    val amm2 = scriveAmministrazione()
    var giro by remember { mutableStateOf(0) }
    val lettura = rememberLettura(Unit, giro + Giri8.amministrazione * 1000) { dati.fase8.sicurezza() }
    var feed by remember { mutableStateOf<eu.stgm.wisper.rapportino.FeedCalendario?>(null) }
    var scollegaTutti by remember { mutableStateOf(false) }
    var accendi by remember { mutableStateOf(false) }
    var spegniCifra by remember { mutableStateOf(false) }
    var chiave by remember { mutableStateOf<String?>(null) }
    var giorni by remember { mutableStateOf<String?>(null) }

    fun scollega(id: String, nome: String) {
        scope.launch { dati.scollega(id).onSuccess { avvisi.mostra("Scollegato: $nome"); giro++ }.onFailure { avvisi.mostra(spiegaErrore2(it, "Non è stato scollegato: riprova")) } }
    }

    Column(
        Modifier.fillMaxSize().background(c.fondo).verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = 40.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Testata(onIndietro = onIndietro)
        TitoloPagina("Sicurezza")
        when (lettura) {
            is Lettura.Pronta -> {
                val s = lettura.dato
                if (s.internetInternoOk) SchedaEsito(true, "Il server interno non è su internet", "Nessuna richiesta da internet sull'ingresso del NAS")
                else SchedaEsito(false, "Il server interno si raggiunge da internet", s.fraseInternet)
                SchedaEsito(
                    s.copiaCifrata, if (s.copiaCifrata) "La copia fuori casa è cifrata" else "La copia fuori casa non è cifrata",
                    if (s.copiaCifrata) "La chiave è scritta su carta" else "Su Drive il database si apre senza chiave, stipendi compresi",
                ) {
                    if (titolare && !s.copiaCifrata) PulsanteBordo("Accendi la cifratura", { accendi = true }, altezza = 48.dp)
                    if (titolare && s.copiaCifrata) PulsanteBordo("Spegni la cifratura", { spegniCifra = true }, altezza = 48.dp)
                }
                SchedaEsito(
                    s.blocchi == 0, "Accessi sbagliati negli ultimi ${s.accessiGiorni} giorni: ${s.accessiSbagliati}",
                    if (s.blocchi == 0) "Nessun blocco" else Testi8.quanti(s.blocchi, "blocco", "blocchi") + if (s.bloccatoChi.isNotBlank()) " per ${s.bloccatoChi}" else "",
                )
                s.passwordIniziali.forEach { (_, nome) -> SchedaEsito(false, "$nome non ha ancora cambiato la password iniziale", "") }
                if (s.dispositiviFermi.isNotEmpty()) SchedaEsito(false, Testi8.quanti(s.dispositiviFermi.size, "dispositivo non si usa", "dispositivi non si usano") + " da più di 60 giorni",
                    s.dispositiviFermi.joinToString(", ") { listOf(it.nome, it.persona).filter { x -> x.isNotBlank() }.joinToString(" · ") }) {
                    if (amm2) s.dispositiviFermi.filter { it.id.isNotBlank() }.forEach { d -> PulsanteBordo("Scollega " + d.nome, { scollega(d.id, d.nome) }, altezza = 48.dp) }
                }
                s.utentiFermi.forEach { (id, nome) ->
                    SchedaEsito(false, "$nome non entra da 90 giorni", "È ancora attivo") {
                        if (titolare && id.isNotBlank()) PulsanteBordo("Disattiva", { nav.vai("amm/utente/$id") }, altezza = 48.dp)
                    }
                }
                if (s.dispositivi.isNotEmpty()) Sezione5("Dispositivi collegati", s.dispositivi.size) {
                    SchedaElenco {
                        s.dispositivi.forEachIndexed { i, d ->
                            if (i > 0) LineaElenco()
                            RigaVoce(
                                d.nome, sotto = listOf(d.persona, d.app, Parole8.quando(d.ultimoUso)).filter { it.isNotBlank() }.joinToString(" · "),
                                icona = if (d.app.startsWith("telefono")) Icone.telefono else Icone.monitor,
                                fine = { if (d.vecchio) Parola8("Versione vecchia") },
                                freccia = false, onClick = if (amm2 && d.id.isNotBlank()) ({ scollega(d.id, d.nome) }) else null,
                            )
                        }
                    }
                }
                if (s.feed.isNotEmpty()) Sezione5("Indirizzi del calendario", s.feed.size) {
                    SchedaElenco {
                        s.feed.forEachIndexed { i, f ->
                            if (i > 0) LineaElenco()
                            RigaVoce(f.nome, sotto = listOf(f.di, f.letto()).filter { it.isNotBlank() }.joinToString(" · "), icona = Icone.calendario, onClick = if (amm2) ({ feed = f }) else null)
                        }
                    }
                }
                Scheda(orizzontale = 18.dp, verticale = 16.dp) {
                    Text("Durata degli accessi", style = Testi.titoloSezione, color = c.testo)
                    val testo = giorni ?: s.sessioneGiorni.toString()
                    val n = testo.trim().toIntOrNull()
                    val err = if (testo.isNotBlank() && (n == null || n < 30 || n > 365)) "Un dispositivo esce da solo dopo: da 30 a 365 giorni" else null
                    CampoTesto(testo, { giorni = it }, "Un dispositivo esce da solo dopo", Modifier.fillMaxWidth(), tastiera = KeyboardType.Number, suffisso = "giorni senza uso", abilitato = amm2, errore = err)
                    if (amm2) PulsanteBordo("Salva", {
                        if (err != null || n == null) return@PulsanteBordo
                        scope.launch { dati.fase8.salvaImpostazioni(mapOf("SESSIONE_GIORNI" to n)).onSuccess { avvisi.mostra("Salvato"); giorni = null; giro++ }.onFailure { avvisi.mostra(spiegaErrore2(it, "Non è stato salvato: riprova")) } }
                    }, Modifier.fillMaxWidth())
                }
                if (titolare) PulsantePericolo("Scollega tutti i dispositivi", { scollegaTutti = true }, Modifier.fillMaxWidth())
            }
            else -> StatoLettura(lettura) { giro++ }
        }
    }
    feed?.let { f -> FoglioIndirizzo(dati, f) { tolto -> feed = null; if (tolto) giro++ } }
    if (scollegaTutti) FoglioScollegaTutti(dati) { scollegaTutti = false }
    if (accendi) FoglioDalBasso({ accendi = false }) {
        Text("Accendere la cifratura?", style = Testi.titoloScheda, color = c.testo)
        Text("Da stanotte la copia su Drive si apre solo con una chiave. Te la mostriamo una volta sola: va scritta su carta, in due posti.", style = Testi.testo, color = c.testo2)
        PulsanteBordo("Accendi la cifratura", {
            accendi = false
            scope.launch {
                dati.fase8.accendiCifratura()
                    .onSuccess { k -> if (k.isBlank()) avvisi.mostra("Il server non ha mostrato la chiave: guarda sul NAS") else chiave = k }
                    .onFailure { avvisi.mostra(spiegaErrore2(it, "La cifratura non si è accesa: riprova")) }
            }
        }, Modifier.fillMaxWidth())
        PulsanteTesto("Annulla", { accendi = false }, Modifier.fillMaxWidth(), colore = c.testo)
    }
    if (spegniCifra) FoglioConferma(
        "Spegnere la cifratura?", "Le copie già cifrate restano cifrate: servirà ancora la chiave scritta su carta.", "Spegni la cifratura",
        onConferma = {
            spegniCifra = false
            scope.launch { dati.fase8.spegniCifratura().onSuccess { avvisi.mostra("Cifratura spenta"); giro++ }.onFailure { avvisi.mostra(spiegaErrore2(it, "Non si è spenta: riprova")) } }
        },
        onAnnulla = { spegniCifra = false }, pericolo = true,
    )
    chiave?.let { k ->
        // La chiave si mostra solo qui (§9.8): niente copie sul telefono, niente registro.
        var scritta by remember { mutableStateOf(false) }
        var errore by remember { mutableStateOf<String?>(null) }
        FoglioDalBasso({ if (scritta) { chiave = null; giro++ } else errore = "Prima scrivila su carta: non la mostriamo più" }) {
            Text("La chiave della copia", style = Testi.titoloScheda, color = c.testo)
            TestoFisso(k)
            Text("Si mostra solo adesso. Senza questa chiave, se si perde il NAS, le copie su Drive non si aprono.", style = Testi.secondario, color = c.tenue)
            PulsanteBordo("Copia", { copiaTesto(ctx, "Chiave della copia", k, avvisi) }, Modifier.fillMaxWidth(), icona = Icone.copia)
            RigaCasella("L'ho scritta su carta, in due posti", scritta) { scritta = !scritta; errore = null }
            errore?.let { Text(it, style = Testi.secondario, color = c.rossoTesto) }
            PulsantePrincipale("Fatto", { if (scritta) { chiave = null; giro++; avvisi.mostra("Cifratura accesa: vale dalla copia di stanotte") } else errore = "Spunta la casella quando l'hai scritta su carta" }, abilitato = scritta)
        }
    }
}

/** Scollega tutti i dispositivi (§9.8): con la password del titolare; anche chi chiede dovrà entrare di nuovo. */
@Composable
private fun FoglioScollegaTutti(dati: Dati, onChiudi: () -> Unit) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    var password by remember { mutableStateOf("") }
    var errore by remember { mutableStateOf<String?>(null) }
    var lavoro by remember { mutableStateOf(false) }
    FoglioDalBasso(onChiudi) {
        Text("Scollega tutti i dispositivi", style = Testi.titoloScheda, color = c.testo)
        Text("Tutti, anche tu, dovranno entrare di nuovo. I rapportini in coda sui telefoni restano e partono dopo l'accesso.", style = Testi.testo, color = c.testo2)
        CampoPassword(password, { password = it; errore = null }, "La tua password", Modifier.fillMaxWidth(), errore = errore)
        PulsantePericolo(if (lavoro) "Scollego…" else "Scollega tutti", {
            if (lavoro) return@PulsantePericolo
            if (password.isBlank()) { errore = "La tua password: scrivila per confermare"; return@PulsantePericolo }
            lavoro = true
            scope.launch {
                dati.fase8.scollegaTutti(password)
                    .onSuccess { n -> avvisi.mostra("Scollegati $n dispositivi: entra di nuovo"); onChiudi() }
                    .onFailure { errore = spiegaErrore2(it, "Non sono stati scollegati: riprova") }
                lavoro = false
            }
        }, Modifier.fillMaxWidth())
        PulsanteTesto("Annulla", onChiudi, Modifier.fillMaxWidth(), colore = c.testo)
    }
}

// ---------------------------------------------------------------------------------- Copie e ripristino (§9.10)

@Composable
internal fun PaginaCopieRipristino(dati: Dati, onIndietro: () -> Unit) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    val puo = scriveAmministrazione()
    var giro by remember { mutableStateOf(0) }
    val lettura = rememberLettura(Unit, giro + Giri8.amministrazione * 1000) { dati.fase8.copie() }
    var copio by remember { mutableStateOf(false) }
    var provo by remember { mutableStateOf(false) }
    var segna by remember { mutableStateOf(false) }

    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = if (puo) SpazioSottoBarra else 40.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Testata(onIndietro = onIndietro)
            TitoloPagina("Copie e ripristino")
            when (lettura) {
                is Lettura.Pronta -> {
                    val k: CopieERipristino = lettura.dato
                    val u = k.copie.ultima
                    Scheda(orizzontale = 18.dp, verticale = 16.dp) {
                        Text("Ultima copia", style = Testi.titoloSezione, color = c.testo)
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            IconaTinta(Icone.scudo, if (u == null) "grigio" else if (u.riuscita) "verde" else "rosso")
                            Column(Modifier.weight(1f)) {
                                Text(u?.let { if (it.riuscita) quandoCopia8(it.quando) else "Non è riuscita · " + quandoCopia8(it.quando).replaceFirstChar { x -> x.lowercase() } } ?: "Ancora nessuna copia",
                                    style = Testi.forte, color = if (u?.riuscita == false) c.rossoTesto else c.testo)
                                val dove = listOfNotNull(u?.dove?.takeIf { it.isNotBlank() }, if (k.copie.foglioAggiornato) "il foglio è aggiornato" else null).joinToString(" · ")
                                if (dove.isNotBlank()) Text(dove, style = Testi.secondario, color = c.tenue)
                            }
                        }
                        if (puo) PulsanteBordo(if (copio) "Copio…" else "Fai una copia adesso", {
                            if (copio) return@PulsanteBordo
                            copio = true
                            scope.launch { dati.copiaAdesso().onSuccess { avvisi.mostra("Copia fatta adesso"); giro++ }.onFailure { avvisi.mostra(spiegaErrore2(it, "La copia non è riuscita: riprova")) }; copio = false }
                        }, Modifier.fillMaxWidth())
                    }
                    // La prova automatica (§9.10): ogni 30 giorni il server riapre la copia e la controlla.
                    Scheda(orizzontale = 18.dp, verticale = 16.dp) {
                        Text("Prova automatica", style = Testi.titoloSezione, color = c.testo)
                        val a = k.ultimaAutomatica
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            if (a != null) Parola8(a.parola)
                            Text(listOfNotNull(a?.let { "Provata il " + dataCorta(it.quando) } ?: "Mai provata", k.prossimaProva.takeIf { it.isNotBlank() }?.let { "prossima il " + dataCorta(it) }).joinToString(" · "),
                                style = Testi.secondario, color = c.tenue)
                        }
                        if (a != null) {
                            Coppia("Integrità", a.integrita.ifBlank { null })
                            Coppia("Righe", a.righeGiuste?.let { if (it) "Come nella copia" else "Non tornano" })
                            Coppia("File", if (a.fileProvati != null) "${a.fileProvati} provati, ${a.fileGiusti ?: 0} giusti" else null)
                            Coppia("Copia su Drive", when (a.fuori) { "giusto" -> "Uguale a quella mandata"; "" -> null; else -> "Diversa da quella mandata" })
                            if (!a.ok && a.dettaglio.isNotBlank()) Text(a.dettaglio, style = Testi.secondario, color = c.rossoTesto)
                        }
                        if (puo) PulsanteBordo(if (provo) "Provo…" else "Prova adesso", {
                            if (provo) return@PulsanteBordo
                            provo = true
                            scope.launch {
                                dati.fase8.provaCopia().onSuccess { p -> avvisi.mostra("Prova della copia: " + p.parola.lowercase()); giro++ }.onFailure { avvisi.mostra(spiegaErrore2(it, "La prova non è partita: riprova")) }
                                provo = false
                            }
                        }, Modifier.fillMaxWidth())
                    }
                    // Il ripristino a mano (§9.10, §11.4): lo fa Andrea sul suo computer ogni 90 giorni.
                    Scheda(orizzontale = 18.dp, verticale = 16.dp) {
                        Text("Ripristino a mano", style = Testi.titoloSezione, color = c.testo)
                        val m = k.ultimaAMano
                        val giorni = m?.let { istanteLocale(it.quando)?.toLocalDate()?.let { d -> java.time.temporal.ChronoUnit.DAYS.between(d, LocalDate.now()).toInt() } }
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            Parola8(if (m != null && (giorni ?: 999) < 90) "Provata" else "Da rifare")
                            Text(if (m == null) "Mai provato a mano" else "Provato a mano il " + dataCorta(m.quando) + (giorni?.let { " · $it giorni fa" } ?: ""), style = Testi.secondario, color = c.tenue)
                        }
                        PASSI_RIPRISTINO.forEachIndexed { i, p ->
                            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.Top) {
                                Box(Modifier.size(26.dp).clip(CircleShape).background(c.superficie2), contentAlignment = Alignment.Center) {
                                    Text("${i + 1}", style = Testi.piccolo.copy(fontWeight = FontWeight.ExtraBold), color = c.testo)
                                }
                                Text(p, style = Testi.secondario.copy(fontWeight = FontWeight.Medium), color = c.testo2, modifier = Modifier.weight(1f))
                            }
                        }
                    }
                    if (k.copie.elenco.isNotEmpty()) Sezione5("Copie sul NAS") {
                        SchedaElenco {
                            k.copie.elenco.take(12).forEachIndexed { i, x ->
                                if (i > 0) LineaElenco()
                                val nome = k.nomi.getOrNull(i).orEmpty()
                                RigaVoce(
                                    nome.ifBlank { quandoCopia8(x.quando) }, sotto = listOf(if (nome.isNotBlank()) quandoCopia8(x.quando) else "", if (x.byte > 0) Testi8.peso(x.byte) else "", if (!x.riuscita) "non riuscita" else "").filter { it.isNotBlank() }.joinToString(" · "),
                                    icona = Icone.disco, fine = { if (k.provata(nome)) Parola8("Provata") },
                                )
                            }
                        }
                    }
                }
                else -> StatoLettura(lettura) { giro++ }
            }
        }
        if (puo) FondoConPulsante(Modifier.align(Alignment.BottomCenter)) {
            PulsantePrincipale("Segna il ripristino provato", { segna = true }, icona = Icone.spunta)
        }
    }
    if (segna) FoglioRipristino(dati, (lettura as? Lettura.Pronta)?.dato) { fatto -> segna = false; if (fatto) giro++ }
}

private val PASSI_RIPRISTINO = listOf(
    "Da Drive, cartella Wisper/Copie NAS/database, scarica la copia più recente e la cartella file",
    "Sul tuo computer, in una cartella fuori da OneDrive: node server/strumenti/ripristina.js <copia> --dati C:\\WisperRipristino\\dati (con la cifratura chiede la chiave scritta su carta)",
    "node server/strumenti/ripristina-file.js --da <cartella file> --dati C:\\WisperRipristino\\dati",
    "Avvia il server su quella cartella (porta 8499) ed entra col tuo utente",
    "Controlla: l'ultimo rapportino di ieri, il riepilogo del mese, una foto, la prossima commessa, l'ultima riga del registro",
    "Torna qui e segna il ripristino provato, poi cancella la cartella",
)

/** Segna il ripristino provato (§9.10): quale copia, da dove, con la chiave scritta, i cinque controlli, note; giallo Salva. */
@Composable
private fun FoglioRipristino(dati: Dati, k: CopieERipristino?, onChiudi: (Boolean) -> Unit) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    val nomi = k?.nomi.orEmpty().filter { it.isNotBlank() }.ifEmpty { k?.copie?.elenco.orEmpty().map { quandoCopia8(it.quando) } }
    val cifrata = remember { mutableStateOf(false) }
    var copia by remember { mutableStateOf(nomi.firstOrNull().orEmpty()) }
    var da by remember { mutableStateOf("drive") }
    var conChiave by remember { mutableStateOf(false) }
    val controlli = remember { mutableStateListOf(false, false, false, false, false) }
    var note by remember { mutableStateOf("") }
    var errore by remember { mutableStateOf<String?>(null) }
    var lavoro by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { dati.fase8.sicurezza().onSuccess { cifrata.value = it.copiaCifrata } }
    FoglioDalBasso({ onChiudi(false) }) {
        Text("Segna il ripristino provato", style = Testi.titoloScheda, color = c.testo)
        Column(Modifier.heightIn(max = 520.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Domanda("Quale copia") { SceltePillole(nomi.map { it to it }, copia, { copia = it }) }
            Domanda("Da dove") { SceltePillole(listOf("drive" to "Da Drive", "nas" to "Dal NAS"), da, { da = it }) }
            if (cifrata.value) RigaCasella("Con la chiave scritta su carta", conChiave) { conChiave = !conChiave }
            CopieERipristino.CONTROLLI.forEachIndexed { i, t -> RigaCasella(t, controlli[i]) { controlli[i] = !controlli[i]; errore = null } }
            CampoTesto(note, { note = it }, "Note", Modifier.fillMaxWidth(), righe = 2)
        }
        errore?.let { Text(it, style = Testi.secondario, color = c.rossoTesto) }
        PulsantePrincipale(if (lavoro) "Salvo…" else "Salva", {
            if (lavoro) return@PulsantePrincipale
            if (copia.isBlank()) { errore = "Quale copia: sceglila"; return@PulsantePrincipale }
            if (controlli.any { !it }) { errore = "Spunta i cinque controlli: se uno non torna, il ripristino non è provato"; return@PulsantePrincipale }
            lavoro = true
            scope.launch {
                dati.fase8.segnaRipristino(copia, da, conChiave, controlli.toList(), note)
                    .onSuccess { avvisi.mostra("Ripristino provato segnato"); onChiudi(true) }
                    .onFailure { errore = spiegaErrore2(it, "Non è stato segnato: riprova") }
                lavoro = false
            }
        }, abilitato = !lavoro)
    }
}

// ---------------------------------------------------------------------------------- Importa ed esporta (§7)

@Composable
internal fun PaginaImportaEsporta(dati: Dati, nav: Navigatore, onIndietro: () -> Unit) {
    val c = W.colori
    val ctx = LocalContext.current
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    val perm = LocalPermessi.current
    val sessione by dati.sessione.collectAsStateWithLifecycle()
    val titolare = sessione.utente.ruolo == Ruoli.TITOLARE
    val importa = perm.modifica(Moduli.CLIENTI)
    var giro by remember { mutableStateOf(0) }
    val esportazioni = if (titolare) rememberLettura("esportazioni", giro) { dati.fase8.esportazioni() } else null
    val importazioni = rememberLettura("importazioni", giro) { dati.fase8.importazioni() }
    var preparo by remember { mutableStateOf(false) }
    var scarico by remember { mutableStateOf<String?>(null) }
    var esporto by remember { mutableStateOf<String?>(null) }
    var archivia by remember { mutableStateOf<Importazione?>(null) }

    // Mentre un file si prepara, si rilegge ogni 5 secondi (arriva anche la notifica "Il file con tutti i dati è pronto").
    val inCorso = (esportazioni as? Lettura.Pronta)?.dato?.any { it.inCorso } == true
    LaunchedEffect(inCorso, giro) { if (inCorso) { delay(5000); giro++ } }

    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = if (importa) SpazioSottoBarra else 40.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Testata(onIndietro = onIndietro)
            TitoloPagina("Importa ed esporta")
            // Esporta tutto (§7.1): solo il titolare (contiene tutto, anche i dati riservati).
            if (titolare) Scheda(orizzontale = 18.dp, verticale = 16.dp) {
                Text("Esporta tutto", style = Testi.titoloSezione, color = c.testo)
                Text("Un file ZIP con un elenco per foglio, per Excel. I file restano nelle copie.", style = Testi.secondario, color = c.tenue)
                val l = (esportazioni as? Lettura.Pronta)?.dato.orEmpty()
                l.take(3).forEach { e ->
                    RigaVoce(
                        e.nome,
                        sotto = when {
                            e.pronta -> listOf("Pronto", Testi8.peso(e.byte), e.scade.takeIf { it.isNotBlank() }?.let { "si toglie il " + dataCorta(it) }).filter { !it.isNullOrBlank() }.joinToString(" · ")
                            e.inCorso -> "Si prepara…"
                            else -> e.errore.ifBlank { "Non è riuscito" }
                        },
                        inizio = { IconaTinta(Icone.scarica, if (e.pronta) "verde" else if (e.inCorso) "blu" else "rosso") },
                        freccia = false,
                        onClick = if (e.pronta) ({
                            if (scarico == null) {
                                scarico = e.id
                                scope.launch {
                                    dati.fase8.scarica(e).onSuccess { f -> Stampa.condividi(ctx, f, "Tutti i dati di Wisper", "application/zip") }
                                        .onFailure { avvisi.mostra(spiegaErrore2(it, "Il file non è arrivato: riprova")) }
                                    scarico = null
                                }
                            }
                        }) else null,
                    )
                }
                PulsanteBordo(if (preparo) "Un momento…" else if (l.any { it.pronta }) "Preparane uno nuovo" else "Prepara il file", {
                    if (preparo) return@PulsanteBordo
                    preparo = true
                    scope.launch {
                        dati.fase8.esportaTutto().onSuccess { avvisi.mostra("Si prepara: arriva una notifica quando è pronto"); giro++ }.onFailure { avvisi.mostra(spiegaErrore2(it, "Non è partito: riprova")) }
                        preparo = false
                    }
                }, Modifier.fillMaxWidth())
            }
            // Esporta per Excel: dalla fase 1, ogni elenco nel suo file (spostato qui da Copie, §9.10).
            Sezione5("Esporta per Excel") {
                SchedaElenco {
                    (listOf("rapportini" to "Rapportini", "clienti" to "Clienti e fornitori", "commesse" to "Commesse") +
                        (if (perm.vede(Moduli.PREVENTIVI)) listOf("preventivi" to "Preventivi") else emptyList()) +
                        (if (perm.vede(Moduli.ATTIVITA)) listOf("attivita" to "Attività") else emptyList())).forEachIndexed { i, (cosa, nome) ->
                        if (i > 0) LineaElenco()
                        RigaVoce(nome, sotto = if (esporto == cosa) "Preparo il file…" else "Un file che Excel apre così com'è", icona = Icone.scarica, freccia = false, onClick = {
                            if (esporto != null) return@RigaVoce
                            esporto = cosa
                            scope.launch {
                                dati.esporta(cosa).onSuccess { f -> Stampa.condividi(ctx, f, "$nome per Excel", "text/csv") }.onFailure { avvisi.mostra(spiegaErrore2(it, "Il file non è pronto: riprova")) }
                                esporto = null
                            }
                        })
                    }
                }
            }
            Sezione5("Importazioni") {
                when (importazioni) {
                    is Lettura.Pronta -> if (importazioni.dato.isEmpty()) RigaCalma("Nessuna importazione") else SchedaElenco {
                        importazioni.dato.forEachIndexed { i, x ->
                            if (i > 0) LineaElenco()
                            RigaVoce(
                                x.nomeFile, sotto = listOf(dataCorta(x.quando), "${x.nuovi} nuovi, ${x.completati} completati, ${x.saltati} saltati").filter { it.isNotBlank() }.joinToString(" · "),
                                icona = Icone.importa, fine = { if (x.archiviata) Parola8("Archiviati") },
                                onClick = if (importa && !x.archiviata) ({ archivia = x }) else null,
                            )
                        }
                    }
                    else -> StatoLettura(importazioni) { giro++ }
                }
            }
        }
        if (importa) FondoConPulsante(Modifier.align(Alignment.BottomCenter)) {
            PulsantePrincipale("Importa clienti e fornitori", { nav.vai("amm/importa-clienti") }, Modifier.bersaglio("importa-clienti"), icona = Icone.importa)
        }
    }
    archivia?.let { x ->
        var lavoro by remember { mutableStateOf(false) }
        FoglioDalBasso({ archivia = null }) {
            Text(x.nomeFile, style = Testi.titoloScheda, color = c.testo)
            Text(x.frase() + ". Archivia le anagrafiche nate da questo file che non hanno ancora commesse, rapportini, preventivi o fatture; i campi completati restano.", style = Testi.testo, color = c.testo2)
            PulsanteBordo(if (lavoro) "Archivio…" else "Archivia quelli importati", {
                if (lavoro) return@PulsanteBordo
                lavoro = true
                scope.launch {
                    dati.fase8.archiviaImportati(x.id)
                        .onSuccess { (a, r) -> avvisi.mostra("Archiviati $a" + if (r > 0) ": $r restano perché hanno già commesse o documenti" else ""); archivia = null; giro++ }
                        .onFailure { avvisi.mostra(spiegaErrore2(it, "Non sono stati archiviati: riprova")) }
                    lavoro = false
                }
            }, Modifier.fillMaxWidth())
            PulsanteTesto("Annulla", { archivia = null }, Modifier.fillMaxWidth(), colore = c.testo)
        }
    }
}

// ---------------------------------------------------------------------------------- Importa clienti e fornitori (§7.2, a passi)

@Composable
internal fun PaginaImportaClienti(dati: Dati, onIndietro: () -> Unit) {
    val c = W.colori
    val ctx = LocalContext.current
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    val arrivato by FileImport.arrivato.collectAsStateWithLifecycle()
    var passo by remember { mutableStateOf(1) }
    var nome by remember { mutableStateOf("") }
    var lettura by remember { mutableStateOf<LetturaImport?>(null) }
    val colonne = remember { mutableStateListOf<ColonnaImport>() }
    var colonna by remember { mutableStateOf(0) }
    var tipo by remember { mutableStateOf("clienti") }
    var controllo by remember { mutableStateOf<ControlloImport?>(null) }
    var fatto by remember { mutableStateOf<Importazione?>(null) }
    var lavoro by remember { mutableStateOf(false) }
    var errore by remember { mutableStateOf<String?>(null) }

    fun leggi(n: String, byte: ByteArray) {
        nome = n
        lavoro = true
        errore = null
        scope.launch {
            dati.fase8.leggiImport(n, byte)
                .onSuccess { l -> lettura = l; colonne.clear(); colonne.addAll(l.colonne); colonna = 0 }
                .onFailure { errore = spiegaErrore2(it, "Il file non si legge: riprova") }
            lavoro = false
        }
    }
    // Il file arrivato dal Condividi si legge subito.
    LaunchedEffect(arrivato) { arrivato?.let { (n, b) -> FileImport.arrivato.value = null; leggi(n, b) } }
    val scegli = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        runCatching { leggiFileScelto(ctx, uri, 5) }.onSuccess { (n, _, b) ->
            if (!FileImport.accettato(n, null)) errore = "Il file deve essere un CSV o un Excel (.xlsx)" else leggi(n, b)
        }.onFailure { errore = it.message ?: "Il file non si legge" }
    }

    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = SpazioSottoBarra),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Testata(onIndietro = onIndietro, chiudi = true)
            TitoloPagina(listOf("Il file", "Le colonne", "Il controllo", "Fatto")[passo - 1], sopra = "Importa clienti e fornitori")
            if (passo < 4) BarraPassiCompito(passo, 3)
            when (passo) {
                1 -> {
                    val l = lettura
                    Column(
                        Modifier.fillMaxWidth().heightIn(min = 140.dp).clip(RoundedCornerShape(20.dp)).bordoTratteggiato(c.bordoCampo, 20.dp)
                            .clickable { if (!lavoro) scegli.launch(arrayOf("text/csv", "text/comma-separated-values", "application/csv", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "text/plain", "application/octet-stream")) }
                            .semantics { role = Role.Button }.padding(18.dp),
                        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterVertically),
                    ) {
                        Icon(Icone.importa, null, tint = c.testo2, modifier = Modifier.size(28.dp))
                        Text(if (lavoro) "Leggo il file…" else nome.ifBlank { "Scegli il file" }, style = Testi.forte, color = c.testo, textAlign = TextAlign.Center)
                        Text(if (l != null) "${l.righe} righe · ${l.colonne.size} colonne" else "CSV o Excel, fino a 5.000 righe e 5 MB", style = Testi.secondario, color = c.tenue, textAlign = TextAlign.Center)
                    }
                }
                2 -> if (colonne.isNotEmpty()) {
                    val k = colonne[colonna.coerceIn(0, colonne.lastIndex)]
                    Scheda(orizzontale = 18.dp, verticale = 16.dp) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            PulsanteTondo(Icone.frecciaSinistra, "Colonna prima", { if (colonna > 0) colonna-- }, dimensione = 48.dp)
                            Text("Colonna ${colonna + 1} di ${colonne.size}", style = Testi.secondarioGrande, color = c.tenue, modifier = Modifier.weight(1f), textAlign = TextAlign.Center)
                            PulsanteTondo(Icone.freccia, "Colonna dopo", { if (colonna < colonne.lastIndex) colonna++ }, dimensione = 48.dp)
                        }
                        Text(k.intestazione.ifBlank { "Senza intestazione" }, style = Testi.titoloSezione, color = c.testo)
                        if (k.esempi.isNotEmpty()) Text("es. " + k.esempi.take(2).joinToString(", "), style = Testi.secondario, color = c.tenue)
                        SceltePillole(ColonnaImport.CAMPI, k.campo, { campo -> colonne[colonna] = k.copy(campo = campo) })
                    }
                    Domanda("Sono") {
                        SceltePillole(listOf("clienti" to "Clienti", "fornitori" to "Fornitori", "colonna" to "Lo dice una colonna"), tipo, { tipo = it })
                    }
                    Text(colonne.filter { it.campo.isNotBlank() }.joinToString(" · ") { ColonnaImport.nomeCampo(it.campo) }.ifBlank { "Nessuna colonna da importare" }, style = Testi.secondario, color = c.tenue)
                }
                3 -> controllo?.let { k ->
                    val nuovi = k.righe("nuovo")
                    val gia = k.righe("gia")
                    Sezione5("Nuovi", k.nuovi) {
                        SchedaElenco {
                            if (k.nuovi == 0) RigaCalma("Nessuno")
                            nuovi.take(5).forEachIndexed { i, r -> if (i > 0) LineaElenco(); RigaVoce(r.optString("nome"), sotto = rigaAnteprima(r).ifBlank { null }, inizio = { IconaTinta(Icone.piu, "verde") }) }
                            if (k.nuovi > nuovi.take(5).size) { if (nuovi.isNotEmpty()) LineaElenco(); RigaVoce("e altri ${k.nuovi - nuovi.take(5).size}") }
                        }
                    }
                    if (k.gia > 0) Sezione5("Già in Wisper", k.gia) {
                        SchedaElenco {
                            gia.take(3).forEachIndexed { i, r ->
                                if (i > 0) LineaElenco()
                                val completa = r.optJSONArray("completa")?.let { a -> (0 until a.length()).map { a.optString(it) } }.orEmpty()
                                RigaVoce(r.optString("nome"), sotto = if (completa.isEmpty()) "C'è già tutto: non cambia niente" else "Si aggiunge: " + completa.joinToString(", ").lowercase(), inizio = { IconaTinta(Icone.spunta, "blu") })
                            }
                            if (k.gia > gia.take(3).size) { if (gia.isNotEmpty()) LineaElenco(); RigaVoce("e altri ${k.gia - gia.take(3).size}: si completano solo i campi vuoti") }
                        }
                    }
                    if (k.daSistemare.isNotEmpty()) Sezione5("Da sistemare", k.daSistemare.size) {
                        SchedaElenco {
                            k.daSistemare.take(20).forEachIndexed { i, r -> if (i > 0) LineaElenco(); RigaVoce("Riga ${r.riga}" + if (r.nome.isNotBlank()) " · ${r.nome}" else "", sotto = r.frase, inizio = { IconaTinta(Icone.allarme, "rosso") }) }
                        }
                    }
                }
                4 -> fatto?.let { x ->
                    Column(Modifier.fillMaxWidth().padding(vertical = 24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(14.dp)) {
                        Box(Modifier.size(72.dp).clip(CircleShape).background(c.firmatoFondo), contentAlignment = Alignment.Center) {
                            Icon(Icone.spunta, null, tint = c.firmatoTesto, modifier = Modifier.size(36.dp))
                        }
                        Text(x.frase(if (tipo == "fornitori") "fornitori" else "clienti"), style = Testi.titoloScheda, color = c.testo, textAlign = TextAlign.Center)
                        Text("Si riconoscono nel registro: importato da $nome", style = Testi.secondario, color = c.tenue, textAlign = TextAlign.Center)
                        PulsanteBordo("Torna a Importa ed esporta", onIndietro)
                    }
                }
            }
            errore?.let { Text(it, style = Testi.secondario, color = c.rossoTesto) }
        }
        if (passo < 4) FondoConPulsante(Modifier.align(Alignment.BottomCenter)) {
            val k = controllo
            val testo = when {
                lavoro -> "Un momento…"
                passo == 3 && k != null -> k.azione
                else -> "Avanti"
            }
            val pronto = !lavoro && when (passo) { 1 -> lettura != null; 2 -> colonne.any { it.campo == "nome" }; else -> k != null && (k.nuovi > 0 || k.completati > 0) }
            PulsantePrincipale(testo, {
                if (!pronto) {
                    errore = when (passo) { 1 -> "Scegli il file"; 2 -> "Nome: scegli la colonna col nome o la ragione sociale"; else -> null }
                    return@PulsantePrincipale
                }
                val l = lettura ?: return@PulsantePrincipale
                when (passo) {
                    1 -> { passo = 2; errore = null }
                    2 -> {
                        if (tipo == "colonna" && colonne.none { it.campo == "tipo" }) { errore = "Scegli la colonna che dice cliente o fornitore"; return@PulsantePrincipale }
                        lavoro = true
                        errore = null
                        scope.launch {
                            dati.fase8.controllaImport(l.idLettura, colonne.toList(), tipo).onSuccess { controllo = it; passo = 3 }
                                .onFailure { errore = spiegaErrore2(it, "Il controllo non è riuscito: riprova") }
                            lavoro = false
                        }
                    }
                    3 -> {
                        lavoro = true
                        scope.launch {
                            dati.fase8.importaSoggetti(l.idLettura, colonne.toList(), tipo)
                                .onSuccess { x -> fatto = x; passo = 4; avvisi.mostra(x.frase(if (tipo == "fornitori") "fornitori" else "clienti")) }
                                .onFailure { errore = spiegaErrore2(it, "L'importazione non è riuscita: riprova") }
                            lavoro = false
                        }
                    }
                }
            }, Modifier.bersaglio("importa-avanti"), abilitato = pronto)
        }
    }
}

/** "Partita IVA 01234567897 · Thiene". */
private fun rigaAnteprima(r: JSONObject): String =
    listOf(r.optString("partitaIva").takeIf { it.isNotBlank() }?.let { "Partita IVA $it" }, r.optString("citta").takeIf { it.isNotBlank() }).filterNotNull().joinToString(" · ")

// ---------------------------------------------------------------------------------- Stato del sistema (§9.11)

@Composable
internal fun PaginaStatoSistema(dati: Dati, nav: Navigatore, onIndietro: () -> Unit) {
    val c = W.colori
    var giro by remember { mutableStateOf(0) }
    val lettura = rememberLettura(Unit, giro) { dati.fase8.statoSistema() }
    val dashboard by dati.dashboard.collectAsStateWithLifecycle()
    Column(
        Modifier.fillMaxSize().background(c.fondo).verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = 40.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Testata(onIndietro = onIndietro)
        TitoloPagina("Stato del sistema")
        when (lettura) {
            is Lettura.Pronta -> {
                val s = lettura.dato
                Scheda(orizzontale = 18.dp, verticale = 16.dp, spazio = 4.dp) {
                    Text("Server", style = Testi.titoloSezione, color = c.testo)
                    Coppia("Versione", s.versione.ifBlank { null })
                    Coppia("Acceso da", s.accesoDa().ifBlank { null })
                    Coppia("Schema", s.schema?.let { "migrazione " + it.toString().padStart(3, '0') })
                    Coppia("Node", s.node.ifBlank { null })
                    val ora = istanteLocale(s.oraServer)?.format(DateTimeFormatter.ofPattern("H:mm"))
                    if (s.fraseOra != null) Text(s.fraseOra!!, style = Testi.secondario.copy(fontWeight = FontWeight.Bold), color = c.ambraTesto)
                    else Coppia("Ora del NAS", ora?.let { "$it, uguale a questo dispositivo" })
                }
                Scheda(orizzontale = 18.dp, verticale = 16.dp, spazio = 4.dp) {
                    Text("Database", style = Testi.titoloSezione, color = c.testo)
                    Coppia("Grandezza", s.databaseMb?.let { Numeri.scrivi(it) + " MB" })
                    Coppia("Controllo d'integrità", listOf(Parole8.quando(s.controllato), s.integrita).filter { it.isNotBlank() }.joinToString(" · ").ifBlank { null })
                }
                Scheda(orizzontale = 18.dp, verticale = 16.dp, spazio = 4.dp) {
                    Text("Disco", style = Testi.titoloSezione, color = c.testo)
                    Coppia("Libero", s.liberoMb?.let { mbLeggibili(it) })
                    Coppia("Usato da Wisper", s.usatoMb?.let { mbLeggibili(it) })
                }
                if (s.lavori.isNotEmpty()) Sezione5("Lavori della notte") {
                    SchedaElenco {
                        s.lavori.forEachIndexed { i, (nome, quando, nota) ->
                            if (i > 0) LineaElenco()
                            val esito = s.lavoriEsiti.getOrElse(i) { if (s.lavoriOk.getOrElse(i) { true }) "ok" else "errore" }
                            val (icona, tinta, parola) = when (esito) {
                                "ok" -> Triple(Icone.spunta, "verde", "ok")
                                "fermo" -> Triple(Icone.orologio, "grigio", "non ancora fatto")
                                else -> Triple(Icone.allarme, "rosso", "non riuscito")
                            }
                            RigaVoce(nome, sotto = listOf(Parole8.quando(quando, sempreOra = true), parola, nota).filter { it.isNotBlank() }.distinct().joinToString(" · "), inizio = { IconaTinta(icona, tinta) })
                        }
                    }
                }
                if (LocalPermessi.current.vede(Moduli.INTEGRAZIONI)) Sezione5("Collegamenti") {
                    SchedaElenco {
                        val e = dashboard?.integrazioniErrore ?: 0
                        RigaVoce(if (e == 0) "Nessun collegamento in Errore" else Testi8.quanti(e, "collegamento in Errore", "collegamenti in Errore"), sotto = "Apri le Integrazioni",
                            inizio = { IconaTinta(Icone.spina, if (e > 0) "rosso" else "verde") }, onClick = { nav.sezione(Sezione.INTEGRAZIONI) })
                    }
                }
                if (s.dispositivi.isNotEmpty()) Sezione5("Dispositivi e versioni") {
                    if (s.ultimeVersioni.isNotEmpty()) Text("Ultima versione: " + s.ultimeVersioni.entries.joinToString(", ") { "${it.key} ${it.value}" }, style = Testi.secondario, color = c.tenue)
                    SchedaElenco {
                        s.dispositivi.forEachIndexed { i, d ->
                            if (i > 0) LineaElenco()
                            RigaVoce(listOf(d.nome, d.app).filter { it.isNotBlank() }.joinToString(" · "), sotto = listOf(d.persona, Parole8.quando(d.ultimoUso)).filter { it.isNotBlank() }.joinToString(" · "),
                                icona = if (d.app.startsWith("telefono")) Icone.telefono else Icone.monitor, fine = { if (d.vecchio) Parola8("Versione vecchia") })
                        }
                    }
                }
            }
            else -> StatoLettura(lettura) { giro++ }
        }
    }
}

/** "1,8 TB", "2,1 GB", "86 MB". */
private fun mbLeggibili(mb: Double): String = when {
    mb >= 1024 * 1024 -> Numeri.scrivi(Math.round(mb / 1024 / 1024 * 10) / 10.0) + " TB"
    mb >= 1024 -> Numeri.scrivi(Math.round(mb / 1024 * 10) / 10.0) + " GB"
    else -> Numeri.scrivi(Math.round(mb).toDouble()) + " MB"
}

// ---------------------------------------------------------------------------------- Lista di controllo (§11)

@Composable
internal fun PaginaListaControllo(dati: Dati, onIndietro: () -> Unit) {
    val c = W.colori
    var giro by remember { mutableStateOf(0) }
    val lettura = rememberLettura(Unit, giro + Giri8.amministrazione * 1000) { dati.fase8.controlliFinali() }
    var segmento by remember { mutableStateOf("tutte") }
    val chiusi = remember { mutableStateMapOf<String, Boolean>() }
    var aperta by remember { mutableStateOf<RigaControllo?>(null) }
    var cambio by remember { mutableStateOf<StatoCambio?>(null) }
    val sessione by dati.sessione.collectAsStateWithLifecycle()
    val titolare = sessione.utente.ruolo == Ruoli.TITOLARE
    Column(
        Modifier.fillMaxSize().background(c.fondo).verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = 40.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Testata(onIndietro = onIndietro)
        TitoloPagina("Lista di controllo")
        when (lettura) {
            is Lettura.Pronta -> {
                val l = lettura.dato
                Scheda(orizzontale = 18.dp, verticale = 16.dp, spazio = 10.dp) {
                    Text(l.frase, style = Testi.forteGrande, color = c.testo)
                    BarraAvanzamento(l.percento)
                }
                // Il cambio (§10, §13.6): lo vedono tutti, lo segna solo il titolare.
                SchedaElenco {
                    RigaVoce("Il cambio", sotto = l.cambio.frase(), icona = Icone.interruttore, freccia = titolare,
                        onClick = if (titolare) ({ cambio = l.cambio }) else null)
                }
                SegmentiScorrevoli(listOf("tutte" to "Tutte", "dafare" to "Da fare", "nonvanno" to "Non vanno", "fatte" to "Fatte"), segmento, { segmento = it })
                val gruppi = l.filtra(segmento)
                if (gruppi.isEmpty()) RigaCalma("Niente qui.")
                gruppi.forEach { g ->
                    val chiuso = chiusi[g.nome] == true
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Row(Modifier.fillMaxWidth().heightIn(min = 44.dp).clickable { chiusi[g.nome] = !chiuso }.semantics { role = Role.Button }, verticalAlignment = Alignment.CenterVertically) {
                            Etichetta("${g.nome} · ${g.righe.size}", Modifier.weight(1f))
                            Icon(if (chiuso) Icone.giu else Icone.su, null, tint = c.tenue, modifier = Modifier.size(18.dp))
                        }
                        if (!chiuso) SchedaElenco {
                            g.righe.forEachIndexed { i, r ->
                                if (i > 0) LineaElenco()
                                Row(
                                    Modifier.fillMaxWidth().heightIn(min = 64.dp).clickable { aperta = r }.semantics { role = Role.Button }.padding(vertical = 10.dp),
                                    verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(10.dp),
                                ) {
                                    Text(r.chiave, style = Testi.piccolo.copy(fontWeight = FontWeight.ExtraBold), color = c.testo2,
                                        modifier = Modifier.clip(RoundedCornerShape(8.dp)).background(c.superficie2).padding(horizontal = 8.dp, vertical = 4.dp))
                                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                                        Text(r.testo, style = Testi.forte.copy(fontWeight = FontWeight.Bold), color = c.testo)
                                        Text(listOf(r.tipoVisto, r.chi, r.il.takeIf { it.isNotBlank() }?.let { dataCorta(it) }.orEmpty(), r.nota).filter { it.isNotBlank() }.joinToString(" · "), style = Testi.secondario, color = c.tenue)
                                        Parola8(r.parola)
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
    aperta?.let { r -> FoglioSegnaControllo(dati, r) { fatto -> aperta = null; if (fatto) giro++ } }
    cambio?.let { x -> FoglioSegnaCambio(dati, x) { fatto -> cambio = null; if (fatto) giro++ } }
}

/** Segna il cambio (§10.5, §13.6): Prima del cambio · Prova generale · Cambio fatto · Ritorno chiuso; giallo Salva. */
@Composable
private fun FoglioSegnaCambio(dati: Dati, adesso: StatoCambio, onChiudi: (Boolean) -> Unit) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    var stato by remember { mutableStateOf(adesso.stato) }
    var lavoro by remember { mutableStateOf(false) }
    var errore by remember { mutableStateOf<String?>(null) }
    FoglioDalBasso({ onChiudi(false) }) {
        Text("Segna il cambio", style = Testi.titoloScheda, color = c.testo)
        Coppia("Adesso", adesso.frase())
        Domanda("A che punto è") { SceltePillole(StatoCambio.STATI, stato, { stato = it }) }
        errore?.let { Text(it, style = Testi.secondario, color = c.rossoTesto) }
        PulsantePrincipale(if (lavoro) "Salvo…" else "Salva", {
            if (lavoro) return@PulsantePrincipale
            if (stato == adesso.stato) { onChiudi(false); return@PulsantePrincipale }
            lavoro = true
            errore = null
            scope.launch {
                dati.fase8.segnaCambio(stato)
                    .onSuccess { avvisi.mostra(it.frase()); onChiudi(true) }
                    .onFailure { errore = spiegaErrore2(it, "Non è stato segnato: riprova") }
                lavoro = false
            }
        }, abilitato = !lavoro)
    }
}

/** Il foglio Segna (§11.1, §15.1): Fatto · Non va · Da fare, nota e Allega; giallo Salva. Le righe dal server non si segnano. */
@Composable
private fun FoglioSegnaControllo(dati: Dati, r: RigaControllo, onChiudi: (Boolean) -> Unit) {
    val c = W.colori
    val ctx = LocalContext.current
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    val puo = scriveAmministrazione()
    var stato by remember { mutableStateOf(if (r.stato == "non_va") "non_va" else if (r.stato == "da_fare") "fatto" else r.stato.takeIf { it in setOf("fatto", "non_va", "da_fare") } ?: "fatto") }
    var nota by remember { mutableStateOf(r.nota) }
    var allegato by remember { mutableStateOf<Triple<String, String, ByteArray>?>(null) }
    var errore by remember { mutableStateOf<String?>(null) }
    var lavoro by remember { mutableStateOf(false) }
    val scegli = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) runCatching { leggiFileScelto(ctx, uri, 20) }.onSuccess { allegato = it }.onFailure { errore = it.message ?: "Il file non si legge" }
    }
    FoglioDalBasso({ onChiudi(false) }) {
        Text(r.chiave, style = Testi.titoloScheda, color = c.testo)
        Text(r.testo, style = Testi.forte, color = c.testo)
        if (r.dalServer) {
            Coppia("Stato", r.parola)
            Coppia("Come", "La controlla il server da solo, coi dati veri")
            Coppia("Adesso", r.nota.ifBlank { "Va bene" })
            PulsanteTesto("Chiudi", { onChiudi(false) }, Modifier.fillMaxWidth(), colore = c.testo)
            return@FoglioDalBasso
        }
        Coppia("Come", r.tipoVisto)
        Coppia("Chi", r.chi.ifBlank { null })
        Coppia("Ultima volta", r.il.takeIf { it.isNotBlank() }?.let { listOf(dataCorta(it), r.utente).filter { x -> x.isNotBlank() }.joinToString(" · ") } ?: "mai")
        if (!puo) { PulsanteTesto("Chiudi", { onChiudi(false) }, Modifier.fillMaxWidth(), colore = c.testo); return@FoglioDalBasso }
        Domanda("Esito") { SceltePillole(listOf("fatto" to "Fatto", "non_va" to "Non va", "da_fare" to "Da fare"), stato, { stato = it }) }
        CampoTesto(nota, { nota = it }, "Nota", Modifier.fillMaxWidth(), righe = 2)
        PulsanteBordo(allegato?.first?.let { "Allegato: $it" } ?: "Allega", { scegli.launch(arrayOf("*/*")) }, Modifier.fillMaxWidth(), icona = Icone.graffetta)
        errore?.let { Text(it, style = Testi.secondario, color = c.rossoTesto) }
        PulsantePrincipale(if (lavoro) "Salvo…" else "Salva", {
            if (lavoro) return@PulsantePrincipale
            if (stato == "non_va" && nota.isBlank()) { errore = "Nota: scrivi cosa non va"; return@PulsantePrincipale }
            lavoro = true
            errore = null
            scope.launch {
                // L'allegato va nell'archivio, categoria Collaudo di Wisper (§11.1), poi la riga lo cita.
                val idDoc = allegato?.let { (n, mime, byte) -> allegaCollaudo(dati, r.chiave, n, mime, byte).getOrElse { e -> errore = spiegaErrore2(e, "L'allegato non si è caricato"); lavoro = false; return@launch } }
                dati.fase8.segnaControllo(r.chiave, stato, nota, idDoc)
                    .onSuccess { avvisi.mostra("Segnato: ${r.chiave}"); onChiudi(true) }
                    .onFailure { errore = spiegaErrore2(it, "Non è stato segnato: riprova") }
                lavoro = false
            }
        }, abilitato = !lavoro)
    }
}

/** Il rapporto o la schermata di un controllo nell'archivio, categoria Collaudo di Wisper (la crea la migrazione 008). */
private suspend fun allegaCollaudo(dati: Dati, chiave: String, nome: String, mime: String, byte: ByteArray): Result<String> = runCatching {
    val cat = dati.fase5.categorie().getOrThrow().firstOrNull { it.nome.equals("Collaudo di Wisper", ignoreCase = true) }
        ?: throw PonteServer.Rifiutato("Manca la categoria Collaudo di Wisper nei documenti")
    val f = dati.fase5.carica(nome, mime, byte).getOrThrow()
    val o = JSONObject().put("titolo", "Collaudo $chiave · $nome").put("idCategoria", PonteServer.idJson(cat.id)).put("origine", "file").put("idFile", f.id)
    dati.fase5.salvaDocumento(o).getOrThrow().first.id
}

// ---------------------------------------------------------------------------------- il codice delle commesse (§9.6)

@Composable
internal fun PaginaFormatoCommessa(dati: Dati, onIndietro: () -> Unit) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    val anno = LocalDate.now().year
    val n = ana.numerazione("commessa") ?: Numerazione("commessa", "{AA}ST{NNN}")
    var f by remember(n.formato) { mutableStateOf(FormatoCommessa.da(n.formato)) }
    var conferma by remember { mutableStateOf(false) }
    var lavoro by remember { mutableStateOf(false) }
    // Il numero continua dal più alto anche col formato di prima (§9.6, salvaNumerazione).
    val codici = ana.commesse.map { it.id }
    val prossimo = maxOf(n.ultimo + 1, CodiceCommessa.prossimo(listOf(n.formato, "{AA}ST{NNN}").distinct(), codici, n.ultimo))
    val anteprima = CodiceCommessa.codiceDa(f.formato, anno, prossimo)
    // I codici di prima si riconoscono anche col formato di sempre (26ST001), se quello di adesso è cambiato.
    val formati = listOf(n.formato, "{AA}ST{NNN}").distinct()
    val ordinati = codici.mapNotNull { k -> formati.firstNotNullOfOrNull { f -> CodiceCommessa.numeroDa(f, k) }?.let { it to k } }.sortedBy { it.first }
    val prima = if (ordinati.isEmpty()) "Le commesse di prima restano come sono." else "Le commesse di prima restano come sono: ${ordinati.first().second} … ${ordinati.last().second}."
    val continua = "Il numero continua da $prossimo."

    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = SpazioSottoBarra),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Testata(onIndietro = onIndietro)
            TitoloPagina("Il codice delle commesse")
            Scheda(orizzontale = 18.dp, verticale = 16.dp) {
                Text("Come si scrive", style = Testi.titoloSezione, color = c.testo)
                Domanda("Anno") { SceltePillole(listOf("AA" to "%02d".format(anno % 100), "AAAA" to anno.toString(), "" to "Niente"), f.anno, { f = f.copy(anno = it) }) }
                Domanda("Ordine") { SceltePillole(listOf(true to "Anno prima", false to "Testo prima"), f.annoPrima, { f = f.copy(annoPrima = it) }) }
                Domanda("Separatore") { SceltePillole(listOf("" to "Niente", "-" to "-", "/" to "/"), f.separatore, { f = f.copy(separatore = it) }) }
                Domanda("Cifre del numero") { SceltePillole(listOf(3 to "3", 4 to "4"), f.cifre, { f = f.copy(cifre = it) }) }
                CampoTesto(f.testo, { t -> f = f.copy(testo = t.filter { it.isLetterOrDigit() }.take(6).uppercase()) }, "Testo", Modifier.fillMaxWidth())
            }
            Scheda(orizzontale = 18.dp, verticale = 18.dp, spazio = 6.dp) {
                Etichetta("La prossima sarà")
                Text(anteprima, style = Testi.totale.copy(fontSize = 34.sp), color = c.testo)
                Text("$prima $continua", style = Testi.secondario, color = c.tenue)
            }
        }
        FondoConPulsante(Modifier.align(Alignment.BottomCenter)) {
            PulsantePrincipale("Salva il formato", { if (f.formato == n.formato) avvisi.mostra("È già questo il formato") else conferma = true }, abilitato = !lavoro)
        }
    }
    if (conferma) FoglioConferma(
        "Salvare il formato?", "La prossima commessa sarà $anteprima. $prima", "Salva il formato",
        onConferma = {
            conferma = false
            lavoro = true
            scope.launch {
                dati.salvaNumerazione(n.copy(formato = f.formato, prossimo = ""))
                    .onSuccess { avvisi.mostra("Salvato. Vale solo per le commesse nuove"); onIndietro() }
                    .onFailure { avvisi.mostra(spiegaErrore2(it, "Non è stato salvato: riprova")) }
                lavoro = false
            }
        },
        onAnnulla = { conferma = false },
    )
}

// ---------------------------------------------------------------------------------- il logo dello studio (§9.3)

/** Il logo e l'anteprima dell'intestazione dei PDF, in bianco e nero (si stampano così). */
@Composable
internal fun SchedaLogoStudio(dati: Dati, puo: Boolean) {
    val c = W.colori
    val ctx = LocalContext.current
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    val idLogo = ana.impostazione("STUDIO_LOGO")
    val logoSuiPdf = ana.impostazione("PDF_LOGO").let { it.isBlank() || it.lowercase() in setOf("true", "1", "si", "sì") }
    var lavoro by remember { mutableStateOf(false) }
    var immagine by remember(idLogo) { mutableStateOf<androidx.compose.ui.graphics.ImageBitmap?>(null) }
    var misure by remember(idLogo) { mutableStateOf("") }
    LaunchedEffect(idLogo) {
        if (idLogo.isNotBlank()) runCatching { dati.file(idLogo) }.getOrNull()?.let { (byte, _) ->
            android.graphics.BitmapFactory.decodeByteArray(byte, 0, byte.size)?.let { b -> immagine = b.asImageBitmap(); misure = "${b.width} × ${b.height}" }
        }
    }
    // Come "Da una foto" della firma: "Carico…" subito, il file letto fuori dal filo principale.
    val scegli = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        lavoro = true
        scope.launch {
            val letto = runCatching { withContext(Dispatchers.IO) { leggiFileScelto(ctx, uri, 1) } }
            val errore: String? = letto.fold({ (nome, mime, byte) ->
                val lato = withContext(Dispatchers.Default) {
                    val o = android.graphics.BitmapFactory.Options().apply { inJustDecodeBounds = true }
                    android.graphics.BitmapFactory.decodeByteArray(byte, 0, byte.size, o)
                    maxOf(o.outWidth, o.outHeight)
                }
                if (lato < 300) "Il logo deve avere almeno 300 punti di lato"
                else dati.fase8.caricaLogo(nome, mime, byte).fold({ null }, { spiegaErrore2(it, "Il logo non si è caricato: riprova") })
            }, { "Il logo deve essere un PNG o un JPG di al massimo 1 MB" })
            lavoro = false
            avvisi.mostra(errore ?: "Logo cambiato: vale per i PDF nuovi")
        }
    }
    Scheda(orizzontale = 18.dp, verticale = 16.dp) {
        Text("Logo", style = Testi.titoloSezione, color = c.testo)
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            Box(
                Modifier.size(64.dp).clip(RoundedCornerShape(14.dp)).background(c.superficie2).let { if (idLogo.isBlank()) it.bordoTratteggiato(c.bordoCampo, 14.dp) else it },
                contentAlignment = Alignment.Center,
            ) {
                immagine?.let { androidx.compose.foundation.Image(it, "Logo dello studio", Modifier.size(56.dp)) } ?: Icon(Icone.immagine, null, tint = c.tenue, modifier = Modifier.size(24.dp))
            }
            Text(if (idLogo.isBlank()) "Nessun logo" else misure.ifBlank { "Logo caricato" }, style = Testi.secondarioGrande, color = c.tenue, modifier = Modifier.weight(1f))
        }
        if (puo) {
            PulsanteBordo(if (lavoro) "Carico…" else "Scegli il logo", { if (!lavoro) scegli.launch(androidx.activity.result.PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }, Modifier.fillMaxWidth(), icona = Icone.carica)
            if (idLogo.isNotBlank()) PulsanteBordo("Togli il logo", {
                scope.launch { dati.salvaImpostazioni(mapOf("STUDIO_LOGO" to "")).onSuccess { avvisi.mostra("Logo tolto: i PDF tornano come prima") }.onFailure { avvisi.mostra(spiegaErrore2(it, "Non è stato tolto: riprova")) } }
            }, Modifier.fillMaxWidth())
        }
        Row(Modifier.fillMaxWidth().heightIn(min = 56.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("Logo sui PDF", style = Testi.forte, color = c.testo, modifier = Modifier.weight(1f))
            Interruttore(logoSuiPdf, { si ->
                if (puo) scope.launch { dati.salvaImpostazioni(mapOf("PDF_LOGO" to if (si) "true" else "false")).onFailure { avvisi.mostra(spiegaErrore2(it, "Non è stato salvato: riprova")) } }
            }, "Logo sui PDF")
        }
    }
    // L'anteprima dell'intestazione (§9.3): logo a sinistra, ragione sociale e indirizzo a destra, il piè con la riga e "Pagina 1 / 2".
    Sezione5("Come esce il PDF") {
        val bianco = androidx.compose.ui.graphics.Color.White
        val nero = androidx.compose.ui.graphics.Color(0xFF1B1B1F)
        val grigio = androidx.compose.ui.graphics.Color(0xFF8A8A92)
        Column(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(bianco).border(1.dp, c.bordoScheda, RoundedCornerShape(12.dp)).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Top) {
                if (logoSuiPdf && immagine != null) androidx.compose.foundation.Image(immagine!!, null, Modifier.size(44.dp), colorFilter = androidx.compose.ui.graphics.ColorFilter.colorMatrix(androidx.compose.ui.graphics.ColorMatrix().apply { setToSaturation(0f) }))
                androidx.compose.foundation.layout.Spacer(Modifier.weight(1f))
                Column(horizontalAlignment = Alignment.End) {
                    Text(ana.impostazione("RAGIONE_SOCIALE").ifBlank { "Lo studio" }, style = Testi.forte, color = nero)
                    Text(ana.impostazione("INDIRIZZO"), style = Testi.piccolo, color = nero)
                    Text(listOf(ana.impostazione("PARTITA_IVA").takeIf { it.isNotBlank() }?.let { "P. IVA $it" }, ana.impostazione("TELEFONO").takeIf { it.isNotBlank() }).filterNotNull().joinToString(" · "), style = Testi.piccolo, color = nero)
                }
            }
            listOf(0.6f, 1f, 0.8f, 0.7f).forEach { w -> Box(Modifier.fillMaxWidth(w).height(6.dp).clip(RoundedCornerShape(3.dp)).background(androidx.compose.ui.graphics.Color(0xFFE6E5E1))) }
            Row(Modifier.fillMaxWidth().padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(ana.impostazione("PDF_PIEDE"), style = Testi.piccolo, color = grigio, modifier = Modifier.weight(1f))
                Text("Pagina 1 / 2", style = Testi.piccolo, color = grigio)
            }
        }
    }
}

