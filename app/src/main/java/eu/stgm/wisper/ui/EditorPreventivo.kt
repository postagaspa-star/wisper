package eu.stgm.wisper.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.Saver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
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
import eu.stgm.wisper.rapportino.Anagrafiche
import eu.stgm.wisper.rapportino.ContiPreventivo
import eu.stgm.wisper.rapportino.ModoVoce
import eu.stgm.wisper.rapportino.Numeri
import eu.stgm.wisper.rapportino.PonteServer
import eu.stgm.wisper.rapportino.Preventivo
import eu.stgm.wisper.rapportino.ScadenzaPagamento
import eu.stgm.wisper.rapportino.SezionePreventivo
import eu.stgm.wisper.rapportino.StatoPreventivo
import eu.stgm.wisper.rapportino.VoceListino
import eu.stgm.wisper.rapportino.VocePreventivo
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.time.LocalDate

/*
 * L'editor del preventivo a passi (fase2.md §5, telefono): Per chi → Le voci →
 * Condizioni → Riepilogo, come il rapportino. Le voci si prendono dal listino con
 * un tocco o si scrivono a mano; ognuna a corpo, a ore o a quantità, con sconto,
 * facoltativa o "una di queste". Il totale in basso è l'anteprima: i conti veri
 * li fa il server quando si salva. Solo le bozze (e i modelli) si cambiano.
 */

/** Un id per le cose nate qui e non ancora salvate: il server non lo riceve. */
private fun nuovoId(): String = PonteServer.NUOVO + System.nanoTime().toString(36)

/** Il preventivo in corso salvato quando Android rifà la schermata (rotazione, poca memoria). */
private val SalvaBozza: Saver<Preventivo?, String> = Saver(
    save = { it?.aJson()?.toString() ?: "" },
    restore = { s -> if (s.isBlank()) null else Preventivo.daJson(JSONObject(s)).perModifica() },
)

/**
 * @param rotta "preventivo-nuovo", "preventivo-nuovo/<idCliente>", "preventivo-modifica/<id>",
 *   "preventivo-modifica/<id>/<passo>/<0|1>" (1 = dopo il salvataggio apri la pagina del preventivo).
 */
@Composable
fun SchermataEditorPreventivo(dati: Dati, nav: Navigatore, rotta: String) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val perm = LocalPermessi.current
    val costi = perm.costi
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    val dettagli by dati.dettagliPreventivi.collectAsStateWithLifecycle()
    val listino by dati.listino.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()

    val nuovo = rotta.startsWith("preventivo-nuovo")
    val pezzi = if (nuovo) rotta.removePrefix("preventivo-nuovo").trim('/').split('/') else rotta.removePrefix("preventivo-modifica/").split('/')
    val id = if (nuovo) "" else pezzi[0]
    val passoIniziale = if (nuovo) 1 else pezzi.getOrNull(1)?.toIntOrNull()?.coerceIn(1, 4) ?: 1
    val apriDopo = nuovo || pezzi.getOrNull(2) != "0"

    var bozza by rememberSaveable(stateSaver = SalvaBozza) { mutableStateOf<Preventivo?>(null) }
    var passo by rememberSaveable { mutableIntStateOf(passoIniziale) }
    var cambiato by rememberSaveable { mutableStateOf(false) }
    var avanti by remember { mutableStateOf(true) }
    var errore by remember { mutableStateOf<String?>(null) }
    var provato by remember { mutableStateOf(false) }
    var salvo by remember { mutableStateOf(false) }
    var chiediUscita by remember { mutableStateOf(false) }

    // ---- la bozza di partenza: un preventivo nuovo, o quello del server
    LaunchedEffect(id) {
        if (bozza != null) return@LaunchedEffect
        if (nuovo) {
            val imp = ana.impostazioni
            bozza = Preventivo(
                idCliente = pezzi.firstOrNull().orEmpty().takeIf { ana.cliente(it) != null }.orEmpty(),
                sezioni = listOf(SezionePreventivo(nuovoId(), "Prestazioni")),
                data = LocalDate.now(), scadenza = LocalDate.now().plusDays(ContiPreventivo.validita(imp)),
                condizioni = imp[ContiPreventivo.PREVENTIVO_CONDIZIONI].orEmpty(),
                eppiPercentuale = ContiPreventivo.eppi(imp), ivaPercentuale = ContiPreventivo.iva(imp),
            )
        } else {
            val p = dettagli[id] ?: dati.preventivo(id).getOrElse { e -> errore = spiegaErrore2(e, "Il server non risponde: riprova"); null }
            if (p != null) bozza = p.perModifica()
        }
    }
    val b = bozza
    if (b == null) {
        Column(Modifier.fillMaxSize().background(c.fondo).padding(MarginePagina), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Testata(onIndietro = { nav.indietro() }, chiudi = true)
            val e = errore
            if (e != null) Scheda(orizzontale = 20.dp, verticale = 18.dp) { Text(e, style = Testi.testo, color = c.testo2) }
            else { Segnaposto(80.dp); Segnaposto(200.dp) }
        }
        return
    }
    if (!b.bozza && !b.modello) {
        Column(Modifier.fillMaxSize().background(c.fondo).padding(MarginePagina), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Testata(onIndietro = { nav.indietro() }, chiudi = true)
            Scheda(orizzontale = 20.dp, verticale = 18.dp) {
                Text("Il preventivo ${b.numero} è già stato inviato: per cambiarlo fai una nuova revisione.", style = Testi.testo, color = c.testo2)
            }
        }
        return
    }

    fun cambia(nuova: Preventivo) {
        bozza = nuova
        cambiato = true
    }

    val imp = ana.impostazioni
    val k = ContiPreventivo.calcola(b, ContiPreventivo.eppi(imp), ContiPreventivo.iva(imp))
    val cliente = ana.cliente(b.idCliente)
    val erroreCliente = if (provato && !b.modello && cliente == null) "Scegli il cliente" else null
    val erroreOggetto = if (provato && b.oggetto.isBlank()) "Scrivi di cosa si tratta" else null

    fun vaiA(n: Int) {
        avanti = n > passo
        passo = n
    }

    fun prossimo() {
        if (passo == 1) {
            provato = true
            if ((!b.modello && cliente == null) || b.oggetto.isBlank()) return
        }
        vaiA(passo + 1)
    }

    fun indietro() {
        when {
            passo > 1 -> vaiA(passo - 1)
            cambiato -> chiediUscita = true
            else -> nav.indietro()
        }
    }

    fun salva() {
        if (salvo) return
        provato = true
        if ((!b.modello && cliente == null) || b.oggetto.isBlank()) { vaiA(1); return }
        if (b.voci.any { it.descrizione.isBlank() }) { errore = "Una voce è senza descrizione: scrivila o togli la voce"; return }
        errore = null
        salvo = true
        scope.launch {
            dati.salvaPreventivo(b)
                .onSuccess { p ->
                    avvisi.mostra(if (nuovo) "Creato ${p.numero.ifBlank { "il modello" }}" else "Salvato ${p.numero.ifBlank { "il modello" }}")
                    nav.indietro()
                    if (apriDopo) nav.vai("preventivo/${p.id}")
                }
                .onFailure { errore = spiegaErrore2(it, "Il preventivo non è stato salvato: riprova") }
            salvo = false
        }
    }

    BackHandler { indietro() }

    Column(Modifier.fillMaxSize().background(c.fondo)) {
        // ---- in alto: la × o indietro, a che passo si è, la barra
        Column(Modifier.padding(horizontal = 20.dp).padding(top = 10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(Modifier.fillMaxWidth().heightIn(min = 48.dp), verticalAlignment = Alignment.CenterVertically) {
                PulsanteTondo(if (passo == 1) Icone.chiudi else Icone.indietro, if (passo == 1) "Chiudi" else "Indietro", { indietro() })
                Spacer(Modifier.weight(1f))
                Text(
                    if (passo < 4) "Passo $passo di 3" else "Riepilogo",
                    style = Testi.secondarioGrande.copy(fontWeight = FontWeight.Bold), color = c.tenue,
                )
            }
            BarraPassiCompito(passo, 4)
        }

        Box(Modifier.weight(1f).fillMaxWidth()) {
            AnimatedContent(
                targetState = passo,
                transitionSpec = {
                    if (avanti) (slideInHorizontally(tween(300)) { it / 4 } + fadeIn(tween(300))) togetherWith (slideOutHorizontally(tween(300)) { -it / 4 } + fadeOut(tween(200)))
                    else (slideInHorizontally(tween(300)) { -it / 4 } + fadeIn(tween(300))) togetherWith (slideOutHorizontally(tween(300)) { it / 4 } + fadeOut(tween(200)))
                },
                modifier = Modifier.fillMaxSize(),
                label = "passi del preventivo",
            ) { n ->
                Column(
                    Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).padding(top = 16.dp, bottom = 24.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    when (n) {
                        1 -> PassoCliente(b, ana, erroreCliente, erroreOggetto, ::cambia)
                        2 -> PassoVoci(b, ana, listino, costi, ::cambia)
                        3 -> PassoCondizioni(b, k.imponibile, costi, ::cambia)
                        else -> PassoRiepilogoPreventivo(b, ana, k, costi) { vaiA(it) }
                    }
                }
            }
        }

        // ---- in basso: il totale e Avanti, o Salva
        Box(Modifier.fillMaxWidth().background(c.fondo)) {
            if (passo < 4) {
                Row(
                    Modifier.fillMaxWidth().border(1.dp, c.bordoScheda).padding(start = 20.dp, end = 20.dp, top = 14.dp, bottom = 16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (costi) Column(Modifier.weight(1f)) {
                        Text("Totale", style = Testi.piccolo.copy(fontWeight = FontWeight.Bold), color = c.tenue)
                        EuroAnimati(k.totale, Testi.titoloScheda.copy(fontSize = Testi.titoloScheda.fontSize * 1.08f))
                    } else Spacer(Modifier.weight(1f))
                    Box(
                        Modifier.width(172.dp).height(60.dp).clip(RoundedCornerShape(18.dp)).background(c.giallo)
                            .clickable { prossimo() }.semantics { role = Role.Button },
                        contentAlignment = Alignment.Center,
                    ) { Text("Avanti", style = Testi.pulsante, color = c.suGiallo) }
                }
            } else {
                Column(Modifier.fillMaxWidth().padding(start = 20.dp, end = 20.dp, top = 12.dp, bottom = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    errore?.let { Text(it, style = Testi.secondario, color = c.rossoTesto) }
                    PulsantePrincipale(if (salvo) "Salvo…" else "Salva", { salva() }, icona = Icone.spunta, abilitato = !salvo)
                }
            }
        }
    }

    if (chiediUscita) {
        FoglioConferma(
            "Uscire senza salvare?", "Quello che hai cambiato in questo preventivo si perde.", "Esci",
            onConferma = { chiediUscita = false; nav.indietro() }, onAnnulla = { chiediUscita = false }, pericolo = true,
        )
    }
}

// ---------------------------------------------------------------------------------- passo 1

@Composable
private fun PassoCliente(b: Preventivo, ana: Anagrafiche, erroreCliente: String?, erroreOggetto: String?, cambia: (Preventivo) -> Unit) {
    val c = W.colori
    var sceltaCliente by remember { mutableStateOf(false) }
    var sceltaSede by remember { mutableStateOf(false) }
    var sceltaReferente by remember { mutableStateOf(false) }
    val cliente = ana.cliente(b.idCliente)
    TitoloPagina(if (b.modello) "Il modello" else "Per chi?", sopra = if (b.numero.isNotBlank()) etichettaDi(b) else null)
    CampoDaScegliere("Cliente", cliente?.nome ?: if (b.modello) "Nessuno" else "Scegli il cliente", cliente == null, { sceltaCliente = true }, errore = erroreCliente)
    val sedi = cliente?.let { ana.sediDi(it.id) }.orEmpty()
    if (sedi.isNotEmpty()) {
        val s = sedi.firstOrNull { it.id == b.idSede }
        CampoDaScegliere("Sede o impianto", s?.nome ?: "Nessuna", s == null, { sceltaSede = true })
    }
    val referenti = cliente?.let { ana.referentiDi(it.id) }.orEmpty()
    if (referenti.isNotEmpty()) {
        val r = referenti.firstOrNull { it.id == b.idReferente }
        CampoDaScegliere("Alla cortese attenzione di", r?.nome ?: "Nessuno", r == null, { sceltaReferente = true })
    }
    CampoTesto(b.oggetto, { cambia(b.copy(oggetto = it)) }, "Oggetto", segnaposto = "Adeguamento impianto elettrico capannone", errore = erroreOggetto, righe = 2)
    CampoTesto(b.introduzione, { cambia(b.copy(introduzione = it)) }, "Introduzione", righe = 3)

    if (sceltaCliente) FoglioSceltaCliente(ana, b.idCliente, onScelto = { cl ->
        sceltaCliente = false
        if (cl?.id != b.idCliente) cambia(b.copy(idCliente = cl?.id.orEmpty(), idSede = "", idReferente = "", nomeCliente = cl?.nome.orEmpty()))
    }, onChiudi = { sceltaCliente = false }, conNessuno = b.modello)
    if (sceltaSede) FoglioDalBasso({ sceltaSede = false }) {
        Text("Sede o impianto", style = Testi.titoloScheda, color = c.testo)
        Column(Modifier.fillMaxWidth().heightIn(max = 420.dp).verticalScroll(rememberScrollState())) {
            RigaVoce("Nessuna", freccia = false, onClick = { sceltaSede = false; cambia(b.copy(idSede = "")) })
            sedi.forEach { s ->
                LineaElenco()
                RigaVoce(s.nome, sotto = s.indirizzoCompleto.ifBlank { null }, icona = Icone.luogo, freccia = false, onClick = { sceltaSede = false; cambia(b.copy(idSede = s.id)) })
            }
        }
    }
    if (sceltaReferente) FoglioDalBasso({ sceltaReferente = false }) {
        Text("Referente", style = Testi.titoloScheda, color = c.testo)
        Column(Modifier.fillMaxWidth().heightIn(max = 420.dp).verticalScroll(rememberScrollState())) {
            RigaVoce("Nessuno", freccia = false, onClick = { sceltaReferente = false; cambia(b.copy(idReferente = "")) })
            referenti.forEach { r ->
                LineaElenco()
                RigaVoce(r.nome, sotto = r.ruolo.ifBlank { null }, inizio = { CerchioPersona(eu.stgm.wisper.rapportino.Utente("", r.nome).iniziali, 40.dp) }, freccia = false,
                    onClick = { sceltaReferente = false; cambia(b.copy(idReferente = r.id)) })
            }
        }
    }
}

// ---------------------------------------------------------------------------------- passo 2

@Composable
private fun PassoVoci(b: Preventivo, ana: Anagrafiche, listino: List<VoceListino>, costi: Boolean, cambia: (Preventivo) -> Unit) {
    val c = W.colori
    val chiuse = remember { mutableStateMapOf<String, Boolean>() }
    var aggiungiIn by remember { mutableStateOf<String?>(null) }
    var voceAperta by remember { mutableStateOf<Pair<String, VocePreventivo>?>(null) }
    var sezioneAperta by remember { mutableStateOf<String?>(null) }

    fun conSezioni(s: List<SezionePreventivo>) = cambia(b.copy(sezioni = s))
    fun sezioneConId(idSez: String) = b.sezioni.firstOrNull { it.id == idSez }

    TitoloPagina("Le voci", sopra = listOf(ana.cliente(b.idCliente)?.nome, b.oggetto).filter { !it.isNullOrBlank() }.joinToString(" · ").ifBlank { null })
    b.sezioni.forEach { s ->
        val chiusa = chiuse[s.id] == true
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(
                Modifier.fillMaxWidth().heightIn(min = 48.dp).clip(RoundedCornerShape(12.dp)).clickable { chiuse[s.id] = !chiusa }
                    .semantics { contentDescription = (if (chiusa) "Apri " else "Chiudi ") + s.titolo.ifBlank { "la sezione" } },
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Icon(if (chiusa) Icone.freccia else Icone.giu, null, tint = c.tenue, modifier = Modifier.size(20.dp))
                Text(
                    s.titolo.ifBlank { "Senza titolo" }, style = Testi.titoloSezione, color = if (s.titolo.isBlank()) c.tenue else c.testo,
                    modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis,
                )
                if (costi) Text(Numeri.euro(ContiPreventivo.subtotale(s)), style = Testi.secondarioGrande.copy(fontWeight = FontWeight.ExtraBold), color = c.testo)
                PulsanteTondo(Icone.altro, "La sezione ${s.titolo}", { sezioneAperta = s.id })
            }
            if (!chiusa) {
                if (s.voci.isNotEmpty()) SchedaElenco {
                    s.voci.forEachIndexed { i, v ->
                        if (i > 0) LineaElenco()
                        RigaVoceLettura(v, costi) { voceAperta = s.id to v }
                    }
                }
                PulsanteBordo("Aggiungi una voce", { aggiungiIn = s.id }, Modifier.fillMaxWidth(), icona = Icone.piu, altezza = 52.dp, tratteggiato = true)
            }
        }
    }
    PulsanteBordo("Aggiungi una sezione", {
        val nuova = SezionePreventivo(nuovoId(), if (b.sezioni.isEmpty()) "Prestazioni" else "")
        conSezioni(b.sezioni + nuova)
        sezioneAperta = nuova.id
    }, Modifier.fillMaxWidth(), icona = Icone.piu, altezza = 48.dp)

    // ---- aggiungere una voce: dal listino con un tocco, o a mano
    aggiungiIn?.let { idSez ->
        FoglioAggiungiVoce(listino, costi, onChiudi = { aggiungiIn = null }, onListino = { l ->
            aggiungiIn = null
            val v = VocePreventivo(nuovoId(), l.nome, l.modo, 1.0, l.unita, l.prezzo, idListino = l.id)
            conSezioni(b.sezioni.map { if (it.id == idSez) it.copy(voci = it.voci + v) else it })
            // A ore o a quantità serve quante: si apre la voce per scriverlo.
            if (l.modo != ModoVoce.CORPO || l.prezzo == null) voceAperta = idSez to v
        }, onLibera = { testo ->
            aggiungiIn = null
            voceAperta = idSez to VocePreventivo("", testo)
        })
    }

    // ---- una voce: modo, quantità, prezzo, sconto, facoltativa, alternativa
    voceAperta?.let { (idSez, v) ->
        val tutte = b.voci
        FoglioVoce(
            v, tutte, costi,
            onChiudi = { voceAperta = null },
            onSalva = { nuova, compagna ->
                voceAperta = null
                val pronta = if (nuova.id.isBlank()) nuova.copy(id = nuovoId()) else nuova
                var sezioni = b.sezioni.map { s ->
                    if (s.id != idSez) s
                    else if (s.voci.any { it.id == pronta.id }) s.copy(voci = s.voci.map { if (it.id == pronta.id) pronta else it })
                    else s.copy(voci = s.voci + pronta)
                }
                // L'alternativa: la compagna prende lo stesso gruppo; nel gruppo una sola è scelta.
                if (compagna != null) sezioni = sezioni.map { s -> s.copy(voci = s.voci.map { if (it.id == compagna) it.copy(alternativa = pronta.alternativa, facoltativa = false) else it }) }
                conSezioni(normalizzaAlternative(sezioni))
            },
            onTogli = if (v.id.isBlank()) null else ({
                voceAperta = null
                conSezioni(normalizzaAlternative(b.sezioni.map { s -> s.copy(voci = s.voci.filterNot { it.id == v.id }) }))
            }),
            onSposta = if (v.id.isBlank()) null else ({ verso ->
                val s = sezioneConId(idSez)
                if (s != null) {
                    val i = s.voci.indexOfFirst { it.id == v.id }
                    val j = i + verso
                    if (i >= 0 && j in s.voci.indices) {
                        val l = s.voci.toMutableList().also { val x = it[i]; it[i] = it[j]; it[j] = x }
                        conSezioni(b.sezioni.map { if (it.id == idSez) it.copy(voci = l) else it })
                    }
                }
            }),
        )
    }

    // ---- una sezione: titolo, ordine, togli
    sezioneAperta?.let { idSez ->
        val s = sezioneConId(idSez)
        if (s == null) sezioneAperta = null else FoglioSezione(
            s, primo = b.sezioni.first().id == idSez, ultimo = b.sezioni.last().id == idSez,
            onChiudi = { sezioneAperta = null },
            onTitolo = { t -> conSezioni(b.sezioni.map { if (it.id == idSez) it.copy(titolo = t) else it }) },
            onSposta = { verso ->
                val i = b.sezioni.indexOfFirst { it.id == idSez }
                val j = i + verso
                if (j in b.sezioni.indices) conSezioni(b.sezioni.toMutableList().also { val x = it[i]; it[i] = it[j]; it[j] = x })
            },
            onTogli = { sezioneAperta = null; conSezioni(normalizzaAlternative(b.sezioni.filterNot { it.id == idSez })) },
        )
    }
}

/** In ogni gruppo di alternative una sola è scelta: la prima scelta, o la prima del gruppo (come il server, §13.5). */
private fun normalizzaAlternative(sezioni: List<SezionePreventivo>): List<SezionePreventivo> {
    val tutte = sezioni.flatMap { it.voci }
    val gruppi = tutte.filter { it.inAlternativa }.groupBy { it.gruppo }
    val scelta = gruppi.mapValues { (_, l) -> (l.firstOrNull { it.scelta } ?: l.first()).id }
    return sezioni.map { s ->
        s.copy(voci = s.voci.map { v ->
            when {
                v.inAlternativa -> v.copy(scelta = scelta[v.gruppo] == v.id, facoltativa = false)
                // Una voce rimasta sola nel suo gruppo non è più un'alternativa.
                else -> v
            }
        }.map { v -> if (v.inAlternativa && (gruppi[v.gruppo]?.size ?: 0) < 2) v.copy(alternativa = "", scelta = false) else v })
    }
}

@Composable
private fun FoglioAggiungiVoce(listino: List<VoceListino>, costi: Boolean, onChiudi: () -> Unit, onListino: (VoceListino) -> Unit, onLibera: (String) -> Unit) {
    val c = W.colori
    var cerca by remember { mutableStateOf("") }
    // 1.4.0 (servizi.md §1): il listino sono i Servizi; si cerca anche nei tag.
    val trovate = eu.stgm.wisper.rapportino.Servizi.elenco(listino, cerca)
    FoglioDalBasso(onChiudi) {
        Text("Aggiungi una voce", style = Testi.titoloScheda, color = c.testo)
        CampoCerca(cerca, { cerca = it }, "Cerca nei servizi")
        Column(Modifier.fillMaxWidth().heightIn(max = 420.dp).verticalScroll(rememberScrollState())) {
            trovate.forEachIndexed { i, l ->
                if (i > 0) LineaElenco()
                RigaVoce(
                    l.nome, sotto = ModoVoce.nome(l.modo), freccia = false,
                    valore = if (costi) l.prezzo?.let { Numeri.euro(it) + if (l.modo == ModoVoce.ORE) "/h" else "" } ?: "senza prezzo" else null,
                    onClick = { onListino(l) },
                )
            }
            if (trovate.isNotEmpty()) LineaElenco()
            RigaVoce(if (cerca.isBlank()) "Voce libera" else "Voce libera «${cerca.trim()}»", icona = Icone.matita, onClick = { onLibera(cerca.trim()) })
        }
    }
}

@Composable
private fun FoglioVoce(
    v: VocePreventivo,
    tutte: List<VocePreventivo>,
    costi: Boolean,
    onChiudi: () -> Unit,
    /** La voce, e l'id dell'altra voce scelta come alternativa (se appena scelta). */
    onSalva: (VocePreventivo, String?) -> Unit,
    onTogli: (() -> Unit)?,
    onSposta: ((Int) -> Unit)?,
) {
    val c = W.colori
    var descrizione by remember { mutableStateOf(v.descrizione) }
    var modo by remember { mutableStateOf(v.modo) }
    var quantita by remember { mutableStateOf(Numeri.scrivi(v.quantita)) }
    var unita by remember { mutableStateOf(v.unita) }
    var prezzo by remember { mutableStateOf(Numeri.scrivi(v.prezzo)) }
    var sconto by remember { mutableStateOf(Numeri.scrivi(v.scontoPercentuale, vuotoSeZero = true)) }
    var facoltativa by remember { mutableStateOf(v.facoltativa) }
    var alternativa by remember { mutableStateOf(v.alternativa) }
    var compagna by remember { mutableStateOf<String?>(null) }
    var sceltaAlternativa by remember { mutableStateOf(false) }
    var errore by remember { mutableStateOf<String?>(null) }

    val q = numeroScritto(quantita)
    val pr = numeroScritto(prezzo)
    val sc = numeroScritto(sconto) ?: 0.0
    val prova = v.copy(descrizione = descrizione, modo = modo, quantita = q ?: 1.0, prezzo = if (costi) pr else v.prezzo, scontoPercentuale = if (costi) sc else v.scontoPercentuale)
    val altre = tutte.filter { it.id != v.id && it.id.isNotBlank() }
    val nelGruppo = if (alternativa.isBlank()) emptyList() else altre.filter { it.inAlternativa && it.gruppo == alternativa.trim().lowercase() }

    FoglioDalBasso(onChiudi) {
        Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(if (v.id.isBlank()) "Nuova voce" else "Voce", style = Testi.titoloScheda, color = c.testo)
            CampoTesto(descrizione, { descrizione = it; errore = null }, "Descrizione", righe = 2, errore = errore)
            Segmenti(ModoVoce.ELENCO.map { it to ModoVoce.nome(it).replaceFirstChar { ch -> ch.uppercase() } }, modo, {
                modo = it
                if (it == ModoVoce.ORE && unita.isBlank()) unita = "ore"
            })
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                CampoTesto(
                    quantita, { quantita = it }, if (modo == ModoVoce.ORE) "Ore" else "Quantità", Modifier.weight(1f), tastiera = KeyboardType.Decimal,
                    errore = erroreDelNumero(quantita), suffisso = if (modo == ModoVoce.ORE) "h" else null,
                )
                if (modo == ModoVoce.QUANTITA) CampoTesto(unita, { unita = it }, "Unità", Modifier.weight(1f), segnaposto = "pz")
            }
            if (costi) Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                CampoTesto(
                    prezzo, { prezzo = it }, if (modo == ModoVoce.ORE) "Prezzo all'ora" else "Prezzo", Modifier.weight(1.3f), segnaposto = "—",
                    tastiera = KeyboardType.Decimal, suffisso = if (modo == ModoVoce.ORE) "€/h" else "€", errore = erroreDelNumero(prezzo),
                )
                CampoTesto(sconto, { sconto = it }, "Sconto", Modifier.weight(1f), segnaposto = "0", tastiera = KeyboardType.Decimal, suffisso = "%", errore = erroreDelNumero(sconto))
            }
            if (costi && pr != null) Row(Modifier.fillMaxWidth()) {
                Text("Importo", style = Testi.secondarioGrande.copy(fontWeight = FontWeight.Bold), color = c.testo2, modifier = Modifier.weight(1f))
                Text(Numeri.euro(ContiPreventivo.importoVoce(prova)), style = Testi.secondarioGrande.copy(fontWeight = FontWeight.ExtraBold), color = c.testo)
            }
            Scheda(orizzontale = 16.dp, verticale = 4.dp, spazio = 0.dp) {
                RigaInterruttore("Facoltativa", facoltativa) { facoltativa = it; if (it) { alternativa = ""; compagna = null } }
            }
            CampoDaScegliere(
                "Una di queste con…",
                when {
                    compagna != null -> altre.firstOrNull { it.id == compagna }?.descrizione ?: "Nessuna"
                    nelGruppo.isNotEmpty() -> nelGruppo.joinToString(", ") { it.descrizione }
                    else -> "Nessuna"
                },
                compagna == null && nelGruppo.isEmpty(), { sceltaAlternativa = true },
            )
            if (onSposta != null) Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                PulsanteRiga("Sposta su", { onSposta(-1) }, Modifier.weight(1f))
                PulsanteRiga("Sposta giù", { onSposta(1) }, Modifier.weight(1f))
            }
            PulsantePrincipale("Fatto", {
                if (descrizione.isBlank()) { errore = "Scrivi la descrizione"; return@PulsantePrincipale }
                if (listOf(quantita, prezzo, sconto).any { erroreDelNumero(it) != null }) return@PulsantePrincipale
                if (sc < 0 || sc > 100) { errore = "Lo sconto va da 0 a 100"; return@PulsantePrincipale }
                onSalva(
                    prova.copy(descrizione = descrizione.trim(), unita = if (modo == ModoVoce.QUANTITA) unita.trim() else if (modo == ModoVoce.ORE) "ore" else "",
                        facoltativa = facoltativa && alternativa.isBlank(), alternativa = alternativa.trim(), scelta = if (alternativa.isBlank() && !facoltativa) false else v.scelta),
                    compagna,
                )
            }, altezza = 56.dp)
            if (onTogli != null) PulsanteTesto("Togli la voce", onTogli, Modifier.fillMaxWidth(), colore = c.rossoTesto)
        }
    }

    if (sceltaAlternativa) {
        FoglioDalBasso({ sceltaAlternativa = false }) {
            Text("Una di queste con…", style = Testi.titoloScheda, color = c.testo)
            Column(Modifier.fillMaxWidth().heightIn(max = 420.dp).verticalScroll(rememberScrollState())) {
                RigaVoce("Nessuna: non è un'alternativa", freccia = false, onClick = { sceltaAlternativa = false; alternativa = ""; compagna = null })
                altre.forEach { a ->
                    LineaElenco()
                    RigaVoce(a.descrizione, sotto = a.dettaglio(costi), freccia = false, onClick = {
                        sceltaAlternativa = false
                        // Il gruppo è quello dell'altra voce, se ne ha già uno; altrimenti il suo nome.
                        alternativa = a.alternativa.ifBlank { alternativa.ifBlank { a.descrizione.trim().lowercase().take(40) } }
                        compagna = a.id
                        facoltativa = false
                    })
                }
            }
        }
    }
}

@Composable
private fun FoglioSezione(
    s: SezionePreventivo,
    primo: Boolean,
    ultimo: Boolean,
    onChiudi: () -> Unit,
    onTitolo: (String) -> Unit,
    onSposta: (Int) -> Unit,
    onTogli: () -> Unit,
) {
    val c = W.colori
    var titolo by remember(s.id) { mutableStateOf(s.titolo) }
    var togli by remember { mutableStateOf(false) }
    FoglioDalBasso({ onTitolo(titolo.trim()); onChiudi() }) {
        Text("Sezione", style = Testi.titoloScheda, color = c.testo)
        CampoTesto(titolo, { titolo = it }, "Titolo", segnaposto = "Progettazione")
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (!primo) PulsanteRiga("Sposta su", { onTitolo(titolo.trim()); onSposta(-1) }, Modifier.weight(1f))
            if (!ultimo) PulsanteRiga("Sposta giù", { onTitolo(titolo.trim()); onSposta(1) }, Modifier.weight(1f))
        }
        PulsantePrincipale("Fatto", { onTitolo(titolo.trim()); onChiudi() }, altezza = 56.dp)
        PulsanteTesto(
            if (togli) "Tocca ancora per togliere anche le ${s.voci.size} voci" else "Togli la sezione",
            { if (s.voci.isEmpty() || togli) onTogli() else togli = true }, Modifier.fillMaxWidth(), colore = c.rossoTesto,
        )
    }
}

// ---------------------------------------------------------------------------------- passo 3

@Composable
private fun PassoCondizioni(b: Preventivo, imponibile: Double, costi: Boolean, cambia: (Preventivo) -> Unit) {
    val c = W.colori
    var pagamento by remember { mutableStateOf<ScadenzaPagamento?>(null) }
    var calendario by remember { mutableStateOf(false) }
    var scontoP by remember { mutableStateOf(Numeri.scrivi(b.scontoPercentuale, vuotoSeZero = true)) }
    var scontoE by remember { mutableStateOf(Numeri.scrivi(b.scontoEuro, vuotoSeZero = true)) }

    TitoloPagina("Condizioni")
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text("Grado di complessità", style = Testi.secondarioGrande.copy(fontWeight = FontWeight.Bold), color = c.testo)
        Segmenti(listOf("bassa" to "Bassa", "media" to "Media", "alta" to "Alta"), b.complessita, { cambia(b.copy(complessita = if (b.complessita == it) "" else it)) })
    }
    if (b.complessita.isNotBlank()) CampoTesto(b.complessitaNota, { cambia(b.copy(complessitaNota = it)) }, "Nota sulla complessità", righe = 2)
    CampoTesto(b.oneriPrevisti, { cambia(b.copy(oneriPrevisti = it)) }, "Oneri previsti", segnaposto = "Pratiche presso il Comune, a carico del cliente", righe = 3)
    if (costi) Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        CampoTesto(scontoP, { scontoP = it; numeroScritto(it).let { n -> if (n != null || it.isBlank()) cambia(b.copy(scontoPercentuale = n ?: 0.0)) } },
            "Sconto", Modifier.weight(1f), segnaposto = "0", tastiera = KeyboardType.Decimal, suffisso = "%", errore = erroreDelNumero(scontoP))
        CampoTesto(scontoE, { scontoE = it; numeroScritto(it).let { n -> if (n != null || it.isBlank()) cambia(b.copy(scontoEuro = n ?: 0.0)) } },
            "Sconto", Modifier.weight(1f), segnaposto = "0", tastiera = KeyboardType.Decimal, suffisso = "€", errore = erroreDelNumero(scontoE))
    }

    Etichetta("Pagamenti")
    if (b.scadenzePagamento.isNotEmpty()) SchedaElenco {
        b.scadenzePagamento.forEachIndexed { i, s ->
            if (i > 0) LineaElenco()
            RigaVoce(
                s.descrizione.ifBlank { pagamentoAParole(s) }, sotto = quandoPagare(s),
                valore = if (costi) Numeri.euro(ContiPreventivo.importoScadenza(s.copy(importo = null), imponibile)) else null,
                onClick = { pagamento = s },
            )
        }
    }
    if (costi && b.scadenzePagamento.isNotEmpty()) {
        val resto = ContiPreventivo.centesimi(imponibile - b.scadenzePagamento.sumOf { ContiPreventivo.importoScadenza(it.copy(importo = null), imponibile) })
        if (resto > 0.004) Text("Restano ${Numeri.euro(resto)} da assegnare", style = Testi.secondario, color = c.gialloTesto)
        if (resto < -0.004) Text("I pagamenti superano l'imponibile di ${Numeri.euro(-resto)}", style = Testi.secondario, color = c.rossoTesto)
    }
    PulsanteBordo("Aggiungi un pagamento", { pagamento = ScadenzaPagamento("", "", ScadenzaPagamento.PERCENTUALE, 0.0, ScadenzaPagamento.FIRMA) }, Modifier.fillMaxWidth(), icona = Icone.piu, altezza = 48.dp)

    CampoQuando("Valido fino al", b.scadenza?.let { giornoEsteso(it) }, { calendario = true }, onTogli = { cambia(b.copy(scadenza = null)) })
    CampoTesto(b.condizioni, { cambia(b.copy(condizioni = it)) }, "Condizioni", righe = 4)
    CampoTesto(b.noteInterne, { cambia(b.copy(noteInterne = it)) }, "Note per te", righe = 2)

    if (calendario) FinestraGiorno(b.scadenza ?: LocalDate.now().plusDays(30), { cambia(b.copy(scadenza = it)) }, { calendario = false })
    pagamento?.let { s ->
        FoglioPagamento(s, onChiudi = { pagamento = null }, onSalva = { nuovo ->
            pagamento = null
            val pronto = if (nuovo.id.isBlank()) nuovo.copy(id = nuovoId()) else nuovo
            cambia(b.copy(scadenzePagamento = if (b.scadenzePagamento.any { it.id == pronto.id }) b.scadenzePagamento.map { if (it.id == pronto.id) pronto else it } else b.scadenzePagamento + pronto))
        }, onTogli = if (s.id.isBlank()) null else ({
            pagamento = null
            cambia(b.copy(scadenzePagamento = b.scadenzePagamento.filterNot { it.id == s.id }))
        }))
    }
}

@Composable
private fun FoglioPagamento(s: ScadenzaPagamento, onChiudi: () -> Unit, onSalva: (ScadenzaPagamento) -> Unit, onTogli: (() -> Unit)?) {
    val c = W.colori
    var descrizione by remember { mutableStateOf(s.descrizione) }
    var tipo by remember { mutableStateOf(s.tipo) }
    var valore by remember { mutableStateOf(Numeri.scrivi(s.valore, vuotoSeZero = true)) }
    var quando by remember { mutableStateOf(s.quando) }
    var data by remember { mutableStateOf(s.data) }
    var calendario by remember { mutableStateOf(false) }
    var errore by remember { mutableStateOf<String?>(null) }
    FoglioDalBasso(onChiudi) {
        Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(if (s.id.isBlank()) "Nuovo pagamento" else "Pagamento", style = Testi.titoloScheda, color = c.testo)
            Segmenti(listOf(ScadenzaPagamento.PERCENTUALE to "Percentuale", ScadenzaPagamento.IMPORTO to "Importo"), tipo, { tipo = it })
            CampoTesto(valore, { valore = it; errore = null }, if (tipo == ScadenzaPagamento.IMPORTO) "Importo" else "Quanto", tastiera = KeyboardType.Decimal,
                suffisso = if (tipo == ScadenzaPagamento.IMPORTO) "€" else "%", errore = errore ?: erroreDelNumero(valore))
            Text("Quando", style = Testi.secondarioGrande.copy(fontWeight = FontWeight.Bold), color = c.testo)
            SegmentiScorrevoli(
                listOf(ScadenzaPagamento.FIRMA to "Alla firma", ScadenzaPagamento.AVANZAMENTO to "Avanzamento", ScadenzaPagamento.FINE to "Fine lavori", ScadenzaPagamento.DATA to "A una data"),
                quando, { quando = it },
            )
            if (quando == ScadenzaPagamento.DATA) CampoQuando("Data", data?.let { giornoEsteso(it) }, { calendario = true })
            CampoTesto(descrizione, { descrizione = it }, "Descrizione", segnaposto = "30% alla firma")
            PulsantePrincipale("Fatto", {
                val n = numeroScritto(valore)
                if (n == null || n <= 0) { errore = "Scrivi quanto"; return@PulsantePrincipale }
                if (tipo == ScadenzaPagamento.PERCENTUALE && n > 100) { errore = "Al massimo 100%"; return@PulsantePrincipale }
                onSalva(s.copy(descrizione = descrizione.trim(), tipo = tipo, valore = n, quando = quando, data = if (quando == ScadenzaPagamento.DATA) data else null, importo = null))
            }, altezza = 56.dp)
            if (onTogli != null) PulsanteTesto("Togli il pagamento", onTogli, Modifier.fillMaxWidth(), colore = c.rossoTesto)
        }
    }
    if (calendario) FinestraGiorno(data, { data = it }, { calendario = false })
}

// ---------------------------------------------------------------------------------- riepilogo

@Composable
private fun PassoRiepilogoPreventivo(b: Preventivo, ana: Anagrafiche, k: eu.stgm.wisper.rapportino.ContoPreventivo, costi: Boolean, onCambia: (Int) -> Unit) {
    val c = W.colori
    TitoloPagina("Riepilogo", sopra = if (b.numero.isNotBlank()) etichettaDi(b) else if (b.modello) "Modello" else "Preventivo nuovo")
    val senzaPrezzo = b.voci.count { it.prezzo == null || it.prezzo <= 0.0 }
    SchedaElenco {
        RigaRiepilogoPreventivo("Per chi", listOfNotNull(ana.cliente(b.idCliente)?.nome, b.oggetto.ifBlank { null }).joinToString(" · ")) { onCambia(1) }
        LineaElenco()
        RigaRiepilogoPreventivo(
            "Le voci",
            Testo.quanti(b.voci.size, "voce", "voci") + " in " + Testo.quanti(b.sezioni.size, "sezione", "sezioni") +
                if (senzaPrezzo > 0) " · ${Testo.quanti(senzaPrezzo, "senza prezzo", "senza prezzo")}" else "",
        ) { onCambia(2) }
        LineaElenco()
        RigaRiepilogoPreventivo(
            "Condizioni",
            listOfNotNull(
                b.complessita.takeIf { it.isNotBlank() }?.let { "complessità $it" },
                b.scadenzePagamento.takeIf { it.isNotEmpty() }?.let { Testo.quanti(it.size, "pagamento", "pagamenti") },
                b.scadenza?.let { "valido fino al " + giornoBreve(it) },
            ).joinToString(" · ").ifBlank { "Da completare" },
        ) { onCambia(3) }
    }
    if (costi) SchedaConto(b, k)
    if (!b.modello) SchedaLegge(ContiPreventivo.legge(b, ana.impostazioni)) { chiave ->
        when (chiave) {
            "prezzi" -> onCambia(2)
            "complessita", "oneri" -> onCambia(3)
        }
    }
}

@Composable
private fun RigaRiepilogoPreventivo(titolo: String, sotto: String, onCambia: () -> Unit) {
    val c = W.colori
    Row(
        Modifier.fillMaxWidth().heightIn(min = 64.dp).clickable(onClick = onCambia).padding(vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(titolo, style = Testi.forte, color = c.testo)
            Text(sotto, style = Testi.secondario, color = c.tenue, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
        Text("Cambia", style = Testi.secondarioGrande.copy(fontWeight = FontWeight.Bold), color = c.collegamento)
    }
}
