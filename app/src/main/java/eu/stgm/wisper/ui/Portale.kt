@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package eu.stgm.wisper.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
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
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import eu.stgm.wisper.Dati
import eu.stgm.wisper.rapportino.AccessoPortale
import eu.stgm.wisper.rapportino.Caricamento
import eu.stgm.wisper.rapportino.ClientePortale
import eu.stgm.wisper.rapportino.InCoda7
import eu.stgm.wisper.rapportino.Parole7
import eu.stgm.wisper.rapportino.Pubblicazione
import eu.stgm.wisper.rapportino.Referente
import eu.stgm.wisper.rapportino.ReferentePortale
import eu.stgm.wisper.rapportino.RegolePortale
import eu.stgm.wisper.rapportino.StatoPortale
import eu.stgm.wisper.rapportino.VoceDaGuardare
import kotlinx.coroutines.launch

/*
 * 15 Portale clienti, la parte dello studio, sul telefono (fase7.md §12.3): la riga dello
 * stato (§0.5), Da guardare · Clienti · Pubblicati · Accessi; la pagina del cliente nel
 * portale con chi entra, cosa si pubblica da solo, i pubblicati, i file e gli accessi.
 * L'IP non c'è (§0.4): degli accessi si mostra quando e il dispositivo.
 */

/** La riga dello stato (§0.5): "Portale Collegato · studiogm-portale.netlify.app", Non collegato, Spento, Non si raggiunge. */
@Composable
internal fun RigaStatoPortale(stato: StatoPortale?, nav: Navigatore) {
    val c = W.colori
    val s = stato ?: return
    Row(
        Modifier.fillMaxWidth().heightIn(min = 52.dp).clip(RoundedCornerShape(16.dp)).background(c.scheda)
            .let { if (s.nonCollegato || !s.attivo) it.clickable { nav.vai("amm/portale") } else it }
            .padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Icon(Icone.globo, null, tint = c.testo2, modifier = Modifier.size(20.dp))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("Portale", style = Testi.forte, color = c.testo)
                if (s.nonCollegato) PillolaScollegata() else Parola7(s.parola)
                if (!s.nonCollegato && s.host.isNotBlank()) Text(s.host, style = Testi.secondario, color = c.tenue)
            }
            if (s.nonCollegato) Text("Il portale non è ancora su internet: Amministrazione › Impostazioni › Portale clienti", style = Testi.secondario, color = c.tenue)
        }
    }
}

@Composable
fun SchermataPortale(dati: Dati, nav: Navigatore) {
    val c = W.colori
    val seg = RicordoPortale.segmento
    val scrive = scrivePortale()
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    var giro by remember { mutableIntStateOf(0) }
    val portale = rememberLettura("portale", giro + Giri7.portale * 1000) { dati.fase7.portale() }
    var scegliCliente by remember { mutableStateOf(false) }
    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).padding(top = 10.dp, bottom = 130.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            TestataInterna({ nav.indietro() })
            TitoloPagina("Portale clienti")
            RigaStatoPortale((portale as? Lettura.Pronta)?.dato?.stato, nav)
            SegmentiScorrevoli(SegmentoPortale.entries.map { it to it.nome }, seg, { RicordoPortale.segmento = it })
            AvvisoRifiuto(dati)
            PillolaRete7(dati)
            when (seg) {
                SegmentoPortale.DA_GUARDARE -> PaginaDaGuardare(dati, nav, portale) { giro++ }
                SegmentoPortale.CLIENTI -> PaginaClientiPortale(dati, nav)
                SegmentoPortale.PUBBLICATI -> PaginaPubblicati(dati, nav)
                SegmentoPortale.ACCESSI -> PaginaAccessi(dati, "")
            }
        }
        if (seg == SegmentoPortale.CLIENTI && scrive) FondoConPulsante(Modifier.align(Alignment.BottomCenter)) {
            PulsantePrincipale("Apri il portale a un cliente", { scegliCliente = true }, icona = Icone.globo)
        }
    }
    if (scegliCliente) FoglioSceltaCliente(ana, "", onScelto = { cl -> scegliCliente = false; if (cl != null) { RicordoPortale.invita = cl.id; nav.vai("portale-cliente/${cl.id}") } }, onChiudi = { scegliCliente = false })
}

// ---------------------------------------------------------------------------------- da guardare

@Composable
private fun PaginaDaGuardare(dati: Dati, nav: Navigatore, portale: Lettura<eu.stgm.wisper.rapportino.Portale7>, onRiprova: () -> Unit) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val ops by dati.operazioni.collectAsStateWithLifecycle()
    val viste by dati.viste.collectAsStateWithLifecycle()
    val scrive = scrivePortale()
    val caricamenti = rememberLettura("caricamenti", Giri7.portale * 1000) { dati.fase7.caricamenti() }
    var file by remember { mutableStateOf<Caricamento?>(null) }
    when (portale) {
        is Lettura.InCorso -> { Segnaposto(110.dp); Segnaposto(110.dp) }
        is Lettura.Errore -> SchedaErrore(portale.messaggio, onRiprova)
        is Lettura.Pronta -> {
            if (portale.dato.lettoAl.isNotBlank()) RigaInfo(lettoAlle(portale.dato.lettoAl))
            val l = InCoda7.applicaDaGuardare(portale.dato.daGuardare, ops)
            if (l.isEmpty()) Scheda(orizzontale = 18.dp, verticale = 16.dp) { RigaCalma("Niente da guardare") }
            l.forEach { d ->
                SchedaDaGuardare(d, scrive, onApri = {
                    val col = d.collegamento
                    if (d.tipo == "caricamento" || col?.pagina == "caricamento") {
                        val car = (caricamenti as? Lettura.Pronta)?.dato?.firstOrNull { it.id == col?.id }
                        if (car != null) file = car else avvisi.mostra("Il file si apre quando c'è rete")
                    } else apriCollegamento(col, nav, viste.map { it.rapportino })
                }, onVisto = {
                    if (dati.esempio) { avvisi.mostra(SOLO_ESEMPIO); return@SchedaDaGuardare }
                    dati.fase7.segnaVisto(d.id)
                    Giri7.portale++
                })
            }
        }
    }
    file?.let { car -> FoglioFileDalCliente(dati, car, idFileDi(dati, car)) { file = null } }
}

/** L'id del file da scaricare di un caricamento, se il server lo manda (`idFile` o `file.id`). */
internal fun idFileDi(dati: Dati, car: Caricamento): String? {
    if (car.idFile.isNotBlank()) return car.idFile
    val copia = dati.fase7.copia("caricamenti") ?: return null
    val o = (copia.optJSONArray("caricamenti") ?: copia.optJSONArray("righe"))?.let { a -> (0 until a.length()).map { a.getJSONObject(it) } }?.firstOrNull { it.optString("id") == car.id } ?: return null
    return o.optString("idFile").ifBlank { o.optJSONObject("file")?.optString("id").orEmpty() }.ifBlank { null }
}

/** Una scheda di Da guardare (§12.3): il tipo in maiuscolo, la cosa, chi e quando, Urgente in rosso tenue; testo Visto. */
@Composable
private fun SchedaDaGuardare(d: VoceDaGuardare, scrive: Boolean, onApri: () -> Unit, onVisto: () -> Unit) {
    val c = W.colori
    val (icona, tinta) = when (d.tipo) {
        "richiesta" -> Icone.chiave to if (d.urgente) "rosso" else "blu"
        "caricamento" -> Icone.importa to "grigio"
        "accettato" -> Icone.preventivo to "verde"
        "firmato" -> Icone.firma to "verde"
        "rifiutato" -> Icone.preventivo to "grigio"
        else -> Icone.fumetto to "blu"
    }
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(if (d.urgente) c.rossoTenue else c.scheda).clickable(onClick = onApri).padding(horizontal = 16.dp, vertical = 14.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            IconaTinta(icona, tinta)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                Text(d.nome.uppercase(), style = Testi.etichetta, color = c.tenue)
                Text(d.titoloBreve, style = Testi.forte, color = c.testo)
                if (d.dettaglio.isNotBlank()) Text(d.dettaglio, style = Testi.secondario, color = c.tenue)
            }
            Icon(Icone.freccia, null, tint = c.tenue, modifier = Modifier.size(18.dp))
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (d.urgente) Parola7("Urgente")
            Spacer(Modifier.weight(1f))
            if (scrive) PulsanteTesto("Visto", onVisto, colore = c.tenue)
        }
    }
}

// ---------------------------------------------------------------------------------- clienti

@Composable
private fun PaginaClientiPortale(dati: Dati, nav: Navigatore) {
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    val clienti = ana.clienti.filter { cl -> cl.portale || ana.referentiDi(cl.id).any { it.portale || it.statoPortale.isNotBlank() && it.statoPortale != "Senza accesso" } }
        .sortedWith(compareBy({ !it.portale }, { it.nome.lowercase() }))
    SchedaElenco {
        if (clienti.isEmpty()) RigaCalma("Nessun cliente ha ancora il portale")
        clienti.forEachIndexed { i, cl ->
            if (i > 0) LineaElenco()
            val refs = ana.referentiDi(cl.id).filter { it.portale }
            val ultimo = refs.map { it.ultimoAccesso }.filter { it.isNotBlank() }.maxOrNull()
            RigaVoce(
                cl.nome,
                sotto = if (refs.isEmpty()) "Nessun referente" else Testo.quanti(refs.size, "referente", "referenti") + (ultimo?.let { " · ultimo accesso " + quando7(it) } ?: ""),
                inizio = { Iniziali(cl.nome, dimensione = 44.dp) },
                fine = { Parola7(if (cl.portale) "Acceso" else "Spento") },
                freccia = false,
                onClick = { nav.vai("portale-cliente/${cl.id}") },
            )
        }
    }
}

// ---------------------------------------------------------------------------------- pubblicati e accessi

@Composable
private fun PaginaPubblicati(dati: Dati, nav: Navigatore) {
    val ops by dati.operazioni.collectAsStateWithLifecycle()
    var giro by remember { mutableIntStateOf(0) }
    val tipo = RicordoPortale.tipo
    val nonVisti = RicordoPortale.nonVisti
    val lettura = rememberLettura("pubblicati", giro + Giri7.portale * 1000) { dati.fase7.pubblicati() }
    SchedePillole(listOf("" to "Tutti", "preventivo" to "Preventivi", "rapportino" to "Rapportini", "documento" to "Documenti", "fattura" to "Fatture", "ticket" to "Richieste", "nonvisti" to "Non ancora visti"),
        if (nonVisti) "nonvisti" else tipo, { v -> if (v == "nonvisti") { RicordoPortale.nonVisti = !nonVisti; RicordoPortale.tipo = "" } else { RicordoPortale.tipo = v; RicordoPortale.nonVisti = false } })
    when (lettura) {
        is Lettura.InCorso -> Segnaposto(160.dp)
        is Lettura.Errore -> SchedaErrore(lettura.messaggio) { giro++ }
        is Lettura.Pronta -> {
            val l = InCoda7.applicaPubblicati(lettura.dato, ops).filter { (tipo.isBlank() || it.tipo == tipo || (tipo == "preventivo" && it.tipo == "contratto")) && (!nonVisti || it.vistoIl.isBlank()) }
            ElencoPubblicati(l, conCliente = true, nav = nav, dati = dati)
        }
    }
}

@Composable
private fun ElencoPubblicati(l: List<Pubblicazione>, conCliente: Boolean, nav: Navigatore, dati: Dati, conTogli: Boolean = false) {
    val avvisi = LocalAvvisi.current
    val scrive = scrivePortale()
    var menu by remember { mutableStateOf<Pubblicazione?>(null) }
    SchedaElenco {
        if (l.isEmpty()) RigaCalma("Niente pubblicato")
        l.forEachIndexed { i, p ->
            if (i > 0) LineaElenco()
            RigaVoce(
                p.titolo,
                sotto = listOf(if (conCliente) p.cliente else "", "pubblicato " + quando7(p.pubblicataIl).let { if (it.startsWith("oggi") || it.startsWith("ieri")) it else "il $it" } + if (p.origine == "regola") " da solo" else "").filter { it.isNotBlank() }.joinToString(" · "),
                icona = iconaPubblicazione(p.tipo),
                fine = {
                    Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        if (p.vistoIl.isNotBlank()) Parola7("Visto " + quando7(p.vistoIl).let { if (it.startsWith("oggi") || it.startsWith("ieri")) it else "il $it" }) else Parola7("Non ancora visto")
                        if (p.daFirmare) Parola7("Da firmare nel portale")
                    }
                },
                freccia = false,
                onClick = { if (conTogli && scrive) menu = p else apriPubblicazione(p, nav) },
            )
        }
    }
    menu?.let { p ->
        FoglioDalBasso({ menu = null }) {
            Text(p.titolo, style = Testi.titoloScheda, color = W.colori.testo)
            if (p.rif.isNotBlank()) VoceMenu(Icone.freccia, "Apri", { menu = null; apriPubblicazione(p, nav) })
            VoceMenu(Icone.chiudi, "Togli dal portale", { menu = null; togliDalPortale(dati, p.id, avvisi) })
        }
    }
}

internal fun iconaPubblicazione(tipo: String) = when (tipo) {
    "preventivo" -> Icone.preventivo
    "contratto", "documento" -> Icone.documento
    "rapportino" -> Icone.firma
    "fattura" -> Icone.fatturazione
    "ticket" -> Icone.chiave
    else -> Icone.globo
}

private fun apriPubblicazione(p: Pubblicazione, nav: Navigatore) {
    if (p.rif.isBlank()) return
    when (p.tipo) {
        "preventivo" -> nav.vai("preventivo/${p.rif}")
        "contratto" -> nav.vai("contratto-ca/${p.rif}")
        "fattura" -> nav.vai("fattura/${p.rif}")
        "documento" -> nav.vai("documento/${p.rif}")
        "ticket" -> nav.vai("ticket/${p.rif}")
    }
}

@Composable
private fun PaginaAccessi(dati: Dati, idCliente: String, massimo: Int = 100) {
    var giro by remember { mutableIntStateOf(0) }
    val filtro = RicordoPortale.accessi
    val lettura = rememberLettura("accessi-$idCliente", giro + Giri7.portale * 1000) { dati.fase7.accessi(idCliente = idCliente.ifBlank { null }) }
    if (massimo > 5) SchedePillole(listOf("" to "Tutti", "entrati" to "Entrati", "azioni" to "Azioni", "errori" to "Errori"), filtro, { RicordoPortale.accessi = it })
    when (lettura) {
        is Lettura.InCorso -> Segnaposto(160.dp)
        is Lettura.Errore -> SchedaErrore(lettura.messaggio) { giro++ }
        is Lettura.Pronta -> ElencoAccessi(lettura.dato.filter { a ->
            when (filtro) { "entrati" -> a.entrata; "errori" -> a.errore; "azioni" -> !a.entrata && !a.errore; else -> true }
        }.take(massimo))
    }
}

@Composable
private fun ElencoAccessi(l: List<AccessoPortale>) {
    SchedaElenco {
        if (l.isEmpty()) RigaCalma("Nessun accesso")
        l.forEachIndexed { i, a ->
            if (i > 0) LineaElenco()
            // L'oggetto (il nome del file, il numero della cosa) accanto alla frase, se è una parola da leggere.
            val conOggetto = a.oggetto.isNotBlank() && !a.frase.contains(a.oggetto) && !Regex("""^[a-z_]+:\d+$""").matches(a.oggetto)
            RigaVoce(
                if (conOggetto) a.frase + " · " + a.oggetto else a.frase,
                sotto = listOf(listOf(a.referente.ifBlank { "Email non riconosciuta" }, a.cliente).filter { it.isNotBlank() }.joinToString(" · "), quando7(a.quando), a.dispositivo).filter { it.isNotBlank() }.joinToString(" · "),
                inizio = { IconaTinta(if (a.errore) Icone.allarme else if (a.entrata) Icone.entrata else Icone.occhio, if (a.errore) "rosso" else "grigio") },
                freccia = false,
            )
        }
    }
}

// ---------------------------------------------------------------------------------- il cliente nel portale

@Composable
fun SchermataPortaleCliente(dati: Dati, nav: Navigatore, idCliente: String) {
    val c = W.colori
    val ctx = LocalContext.current
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    val ops by dati.operazioni.collectAsStateWithLifecycle()
    var giro by remember { mutableIntStateOf(0) }
    val lettura = rememberLettura("portale-cliente-$idCliente", giro + Giri7.portale * 1000) { dati.fase7.portaleCliente(idCliente) }
    val scrive = scrivePortale()
    var accesso by remember { mutableStateOf<ReferentePortale?>(null) }
    var invita by remember { mutableStateOf(RicordoPortale.invita == idCliente) }
    var menu by remember { mutableStateOf(false) }
    var anteprima by remember { mutableStateOf(false) }
    var prima by remember { mutableStateOf(false) }
    var file by remember { mutableStateOf<Caricamento?>(null) }
    var cambiato by remember { mutableStateOf<ClientePortale?>(null) }
    if (RicordoPortale.invita == idCliente) RicordoPortale.invita = ""
    val nomeCliente = ana.cliente(idCliente, "")?.nome.orEmpty()

    fun salva(portale: Boolean? = null, regole: RegolePortale? = null, importi: Boolean? = null, frase: String) {
        if (dati.esempio) { avvisi.mostra(SOLO_ESEMPIO); return }
        val base = cambiato ?: (lettura as? Lettura.Pronta)?.dato ?: return
        cambiato = base.copy(portale = portale ?: base.portale, regole = regole ?: base.regole, importi = importi ?: base.importi)
        scope.launch {
            dati.fase7.salvaPortaleCliente(idCliente, portale, regole, importi)
                .onSuccess { cambiato = it.takeIf { x -> x.id.isNotBlank() } ?: cambiato; avvisi.mostra(frase); if (portale != null) dati.aggiorna() }
                .onFailure { cambiato = base; avvisi.mostra(it.message ?: "Non è cambiato: riprova") }
        }
    }

    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).padding(top = 10.dp, bottom = 130.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            TestataInterna({ nav.indietro() }) { PulsanteTondo(Icone.altro, "Altre azioni", { menu = true }) }
            when (lettura) {
                is Lettura.InCorso -> { TitoloPagina(nomeCliente); Segnaposto(80.dp); Segnaposto(160.dp) }
                is Lettura.Errore -> { TitoloPagina(nomeCliente); SchedaErrore(lettura.messaggio) { giro++ } }
                is Lettura.Pronta -> {
                    val cp = cambiato ?: lettura.dato
                    TitoloPagina(cp.nome.ifBlank { nomeCliente }, sopra = "Portale clienti")
                    Scheda(orizzontale = 18.dp, verticale = 4.dp) {
                        RigaInterruttore("Portale acceso", cp.portale, { si -> if (scrive) salva(portale = si, frase = if (si) "Portale acceso per ${cp.nome}" else "Portale spento per ${cp.nome}: chi era dentro è uscito") })
                    }
                    Sezione5("Chi entra") {
                        val chi = cp.referenti.filter { it.portale || it.statoVisto == "Tolto" || it.statoVisto == "Invitato" || it.statoVisto == "Attivo" }
                        SchedaElenco {
                            if (chi.isEmpty()) RigaCalma("Nessuno entra ancora")
                            chi.forEachIndexed { i, r ->
                                if (i > 0) LineaElenco()
                                RigaChiEntra(r, testoPermessi(r, ana.sediDi(idCliente)), onClick = if (scrive) ({ accesso = r }) else null)
                            }
                        }
                    }
                    Sezione5("Cosa si pubblica da solo") {
                        val rg = cp.regole
                        Scheda(orizzontale = 18.dp, verticale = 4.dp, spazio = 0.dp) {
                            RigaInterruttore("Preventivi quando partono", rg.preventivi, { if (scrive) salva(regole = rg.copy(preventivi = it), frase = "Regola salvata") })
                            RigaInterruttore("Contratti quando si attivano", rg.contratti, { if (scrive) salva(regole = rg.copy(contratti = it), frase = "Regola salvata") })
                            RigaInterruttore("Rapportini firmati", rg.rapportiniFirmati, { if (scrive) salva(regole = rg.copy(rapportiniFirmati = it), frase = "Regola salvata") })
                            RigaInterruttore("Rapportini da firmare", rg.rapportiniDaFirmare, { if (scrive) salva(regole = rg.copy(rapportiniDaFirmare = it), frase = "Regola salvata") })
                            RigaInterruttore("Fatture emesse", rg.fatture, { if (scrive) salva(regole = rg.copy(fatture = it), frase = "Regola salvata") })
                            Column(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text("Richieste", style = Testi.forte, color = c.testo)
                                Segmenti(listOf("portale" to "Solo dal portale", "tutte" to "Tutte"), rg.richieste, { if (scrive) salva(regole = rg.copy(richieste = it), frase = "Regola salvata") })
                            }
                            RigaInterruttore("Importi nei rapportini", cp.importi, { if (scrive) salva(importi = it, frase = "Salvato") })
                        }
                        if (scrive) PulsanteBordo("Pubblica anche quelli di prima", { prima = true }, altezza = 48.dp)
                    }
                    Sezione5("Pubblicati") { ElencoPubblicati(InCoda7.applicaPubblicati(cp.pubblicati, ops), conCliente = false, nav = nav, dati = dati, conTogli = true) }
                    Sezione5("Arrivati dal cliente") {
                        val cars = InCoda7.applicaCaricamenti(cp.caricamenti, ops)
                        SchedaElenco {
                            if (cars.isEmpty()) RigaCalma("Nessun file")
                            cars.forEachIndexed { i, x ->
                                if (i > 0) LineaElenco()
                                RigaVoce(x.nome, sotto = listOf(x.referente, quando7(x.creato), peso(x.byte)).filter { it.isNotBlank() }.joinToString(" · "), icona = Icone.importa,
                                    fine = { Parola7(x.parolaStato) }, freccia = false, onClick = { file = x.copy(cliente = x.cliente.ifBlank { cp.nome }, idCliente = idCliente) })
                            }
                        }
                    }
                    Sezione5("Accessi recenti") {
                        ElencoAccessi(cp.accessi.take(5))
                        PulsanteTesto("Tutti", { RicordoPortale.segmento = SegmentoPortale.ACCESSI; nav.sezione(Sezione.PORTALE) }, colore = c.gialloTesto)
                    }
                }
            }
        }
        val cp = cambiato ?: (lettura as? Lettura.Pronta)?.dato
        if (scrive && cp?.portale == true) FondoConPulsante(Modifier.align(Alignment.BottomCenter)) {
            PulsantePrincipale("Invita un referente", { invita = true }, icona = Icone.piu, modifier = Modifier.bersaglio("invita"))
        }
    }

    if (menu) FoglioDalBasso({ menu = false }) {
        Text(nomeCliente, style = Testi.titoloScheda, color = c.testo)
        VoceMenu(Icone.occhio, "Vedi come lo vede il cliente", { menu = false; anteprima = true })
        if (scrive) VoceMenu(Icone.chiudi, "Spegni il portale per questo cliente", { menu = false; salva(portale = false, frase = "Portale spento per $nomeCliente: chi era dentro è uscito") }, pericolo = true)
    }
    if (anteprima) {
        val refs = (cambiato ?: (lettura as? Lettura.Pronta)?.dato)?.referenti.orEmpty().filter { it.portale }
        FoglioDalBasso({ anteprima = false }) {
            Text("Come lo vede il cliente", style = Testi.titoloScheda, color = c.testo)
            if (refs.isEmpty()) RigaCalma("Nessun referente ha l'accesso")
            refs.forEach { r ->
                RigaVoce(r.nome, sotto = r.email, freccia = false, onClick = {
                    anteprima = false
                    if (dati.esempio) { avvisi.mostra(SOLO_ESEMPIO); return@RigaVoce }
                    scope.launch {
                        dati.fase7.anteprima(r.id)
                            .onSuccess { link -> apriIndirizzo5(ctx, link, avvisi) }
                            .onFailure { e -> avvisi.mostra(if (e is java.io.IOException || e.cause is java.io.IOException) "Serve la rete: l'anteprima si apre da qui appena c'è" else e.message ?: "L'anteprima non si apre: riprova") }
                    }
                })
            }
        }
    }
    accesso?.let { r -> FoglioAccessoReferente(dati, r, idCliente, nomeCliente) { accesso = null; giro++ } }
    if (invita) FoglioInvita(dati, idCliente, nomeCliente, (cambiato ?: (lettura as? Lettura.Pronta)?.dato)?.referenti.orEmpty()) { invita = false; giro++ }
    if (prima) FoglioPubblicaPrima(dati, idCliente) { prima = false; giro++ }
    file?.let { car -> FoglioFileDalCliente(dati, car, idFileDi(dati, car)) { file = null } }
}

/** Un referente in Chi entra (§12.3): nome e ruolo, email, cosa può fare, la pillola dello stato, l'ultimo accesso. */
@Composable
private fun RigaChiEntra(r: ReferentePortale, permessi: String, onClick: (() -> Unit)?) {
    val c = W.colori
    Row(
        Modifier.fillMaxWidth().heightIn(min = 64.dp).let { if (onClick != null) it.clickable(onClick = onClick) else it }.padding(vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        CerchioPersona(r.nome.split(' ', '.').filter { it.length > 1 }.take(2).joinToString("") { it.take(1) }.uppercase(), 40.dp)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(r.nome + if (r.ruolo.isNotBlank()) " · ${r.ruolo}" else "", style = Testi.forte, color = c.testo)
            if (r.email.isNotBlank()) Text(r.email, style = Testi.secondario, color = c.tenue)
            Text(permessi, style = Testi.secondario, color = c.testo2)
            if (r.ultimoAccesso.isNotBlank()) Text("Ultimo accesso " + quando7(r.ultimoAccesso), style = Testi.piccolo, color = c.tenue)
        }
        Parola7(r.statoVisto)
    }
}

/** "Preventivi · Rapportini · Documenti · Richieste" o "Solo Magazzino automatico di Schio" (§12.3). */
private fun testoPermessi(r: ReferentePortale, sedi: List<eu.stgm.wisper.rapportino.Sede>): String {
    if (!r.sedi.isNullOrEmpty()) return "Solo " + r.sedi.mapNotNull { id -> sedi.firstOrNull { it.id == id }?.nome }.joinToString(", ").ifBlank { "alcune sedi" }
    return Parole7.PERMESSI.filter { r.livello(it.first) > 0 }.joinToString(" · ") { it.second.replace(" d'intervento", "").replace(" e contratti", "") }.ifBlank { "Niente" }
}

/** I cinque tipi coi segmenti No · Vede · e il terzo che dice cosa fa (fatture solo No · Vede). */
@Composable
private fun PermessiPortale(permessi: Map<String, Int>, onCambia: (String, Int) -> Unit) {
    val c = W.colori
    Parole7.PERMESSI.forEach { (tipo, nome, fa) ->
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(nome, style = Testi.secondarioGrande.copy(fontWeight = FontWeight.Bold), color = c.testo)
            val opzioni = buildList { add(0 to "No"); add(1 to "Vede"); if (fa.isNotBlank()) add(2 to fa) }
            Segmenti(opzioni, (permessi[tipo] ?: 0).coerceAtMost(opzioni.size - 1), { onCambia(tipo, it) })
        }
    }
}

/** Le sedi del referente: Tutte · Solo queste, con le pillole delle sedi e degli impianti del cliente. */
@Composable
private fun SediPortale(sedi: List<eu.stgm.wisper.rapportino.Sede>, scelte: List<String>?, onCambia: (List<String>?) -> Unit) {
    if (sedi.isEmpty()) return
    Etichetta("Sedi")
    Segmenti(listOf(true to "Tutte", false to "Solo queste"), scelte == null, { tutte -> onCambia(if (tutte) null else scelte ?: emptyList()) })
    if (scelte != null) FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        sedi.forEach { s -> Pillola(s.nome, s.id in scelte, { onCambia(if (s.id in scelte) scelte - s.id else scelte + s.id) }) }
    }
}

/** Accesso di Sig. Ferretti (§12.3): permessi, sedi, avvisi per email, Rimanda l'invito, Togli l'accesso, Salva. */
@Composable
private fun FoglioAccessoReferente(dati: Dati, r: ReferentePortale, idCliente: String, nomeCliente: String, onChiudi: () -> Unit) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    var permessi by remember { mutableStateOf(r.permessi) }
    var sedi by remember { mutableStateOf(r.sedi) }
    var avvisiEmail by remember { mutableStateOf(r.avvisiEmail) }
    var lavoro by remember { mutableStateOf(false) }
    var togli by remember { mutableStateOf(false) }
    fun serveRete(e: Throwable, frase: String) = if (e is java.io.IOException || e.cause is java.io.IOException) "Serve la rete: $frase" else e.message ?: "Non è riuscito: riprova"
    if (togli) {
        FoglioConferma("Togliere l'accesso a ${r.nome}?", "Esce subito dal portale e i suoi link non valgono più. Resta fra i referenti di $nomeCliente.", "Togli l'accesso", onConferma = {
            togli = false
            if (dati.esempio) { avvisi.mostra(SOLO_ESEMPIO); onChiudi(); return@FoglioConferma }
            scope.launch {
                dati.fase7.togliAccesso(r.id).onSuccess { avvisi.mostra("Accesso tolto a ${r.nome}"); dati.aggiorna(); onChiudi() }.onFailure { avvisi.mostra(serveRete(it, "si toglie da qui appena c'è")) }
            }
        }, onAnnulla = { togli = false }, pericolo = true)
        return
    }
    FoglioDalBasso(onChiudi) {
        Text("Accesso di ${r.nome}", style = Testi.titoloScheda, color = c.testo)
        Column(Modifier.heightIn(max = 520.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            PermessiPortale(permessi) { t, l -> permessi = permessi + (t to l) }
            SediPortale(ana.sediDi(idCliente), sedi) { sedi = it }
            RigaInterruttore("Avvisi per email", avvisiEmail, { avvisiEmail = it })
            PulsanteBordo("Rimanda l'invito", {
                if (dati.esempio) { avvisi.mostra(SOLO_ESEMPIO); return@PulsanteBordo }
                scope.launch {
                    dati.fase7.invita(r.id, null, null, sedi)
                        .onSuccess { (_, email) -> avvisi.mostra(if (email == "domani") "Le email di oggi sono finite: l'invito parte domani" else "Invito mandato a ${r.email}") }
                        .onFailure { avvisi.mostra(serveRete(it, "l'invito parte da qui appena c'è")) }
                }
            }, Modifier.fillMaxWidth(), icona = Icone.email)
            if (r.portale) PulsanteTesto("Togli l'accesso", { togli = true }, Modifier.fillMaxWidth(), colore = c.rossoTesto)
        }
        PulsantePrincipale(if (lavoro) "Salvo…" else "Salva", {
            if (lavoro) return@PulsantePrincipale
            if (dati.esempio) { avvisi.mostra(SOLO_ESEMPIO); onChiudi(); return@PulsantePrincipale }
            lavoro = true
            scope.launch {
                dati.fase7.salvaAccesso(r.id, permessi, sedi, sedi == null, avvisiEmail)
                    .onSuccess { avvisi.mostra("Accesso salvato: vale da subito"); onChiudi() }
                    .onFailure { avvisi.mostra(serveRete(it, "si salva da qui appena c'è")) }
                lavoro = false
            }
        }, altezza = 56.dp)
    }
}

/**
 * Invita un referente (§12.3): Chi (i referenti del cliente con l'email; + Nuovo referente;
 * per un privato già lui), Cosa può fare, Sedi, "L'email d'invito parte a …", Manda l'invito.
 * Non collegato: la riga Non collegato al posto del giallo. Vuole la rete (§3.20).
 */
@Composable
private fun FoglioInvita(dati: Dati, idCliente: String, nomeCliente: String, giaNelPortale: List<ReferentePortale>, onChiudi: () -> Unit) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    val sessione by dati.sessione.collectAsStateWithLifecycle()
    val portale = rememberLettura("portale", 0) { dati.fase7.portale() }
    val cliente = ana.cliente(idCliente, "") ?: ana.clienti.firstOrNull { it.nome == nomeCliente }
    val privato = cliente?.partitaIva.isNullOrBlank() && ana.referentiDi(idCliente).isEmpty()
    val conEmail = ana.referentiDi(idCliente).filter { it.email.isNotBlank() }
    var scelto by remember { mutableStateOf(conEmail.firstOrNull { r -> giaNelPortale.none { it.id == r.id && it.portale } }?.id ?: conEmail.firstOrNull()?.id.orEmpty()) }
    var nuovo by remember { mutableStateOf(false) }
    var nome by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var permessi by remember { mutableStateOf(Parole7.permessiDiBase(privato)) }
    var sedi by remember { mutableStateOf<List<String>?>(null) }
    var lavoro by remember { mutableStateOf(false) }
    var errore by remember { mutableStateOf<String?>(null) }
    val stato = (portale as? Lettura.Pronta)?.dato?.stato
    val nonCollegato = stato?.nonCollegato ?: !sessione.interfaccia.portaleCollegato
    val destinazione = when {
        nuovo -> email.trim()
        privato -> cliente?.email.orEmpty()
        else -> conEmail.firstOrNull { it.id == scelto }?.email.orEmpty()
    }
    FoglioDalBasso(onChiudi) {
        Text("Invita un referente", style = Testi.titoloScheda, color = c.testo)
        Column(Modifier.heightIn(max = 500.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Etichetta("Chi")
            if (privato) Text(cliente?.nome.orEmpty() + " · " + cliente?.email.orEmpty(), style = Testi.forte, color = c.testo)
            else FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                conEmail.forEach { r -> Pillola(r.nome, !nuovo && r.id == scelto, { nuovo = false; scelto = r.id }) }
                Pillola("+ Nuovo referente", nuovo, { nuovo = true })
            }
            if (nuovo) {
                CampoTesto(nome, { nome = it }, "Nome", Modifier.fillMaxWidth())
                CampoTesto(email, { email = it.trim() }, "Email", Modifier.fillMaxWidth(), tastiera = KeyboardType.Email)
            }
            Etichetta("Cosa può fare")
            PermessiPortale(permessi) { t, l -> permessi = permessi + (t to l) }
            SediPortale(ana.sediDi(idCliente), sedi) { sedi = it }
        }
        errore?.let { Text(it, style = Testi.secondario, color = c.rossoTesto) }
        if (nonCollegato) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                PillolaScollegata()
                Text("Prima scegli come portare il portale su internet (Amministrazione)", style = Testi.secondario, color = c.tenue, modifier = Modifier.weight(1f))
            }
            return@FoglioDalBasso
        }
        if (destinazione.isNotBlank()) Text("L'email d'invito parte a $destinazione", style = Testi.secondario, color = c.tenue)
        PulsantePrincipale(if (lavoro) "Mando…" else "Manda l'invito", {
            if (lavoro) return@PulsantePrincipale
            errore = when {
                nuovo && nome.isBlank() -> "Scrivi il nome"
                nuovo && (!email.contains('@') || email.contains(' ')) -> "Email: manca la @ o c'è uno spazio"
                !nuovo && !privato && scelto.isBlank() -> "Il referente non ha l'email: scrivila prima"
                else -> null
            }
            if (errore != null) return@PulsantePrincipale
            if (dati.esempio) { avvisi.mostra(SOLO_ESEMPIO); onChiudi(); return@PulsantePrincipale }
            lavoro = true
            scope.launch {
                val idReferente = when {
                    nuovo -> dati.salvaReferente(Referente("", idCliente, nome.trim(), email = email.trim())).getOrElse { e -> errore = e.message; lavoro = false; return@launch }.id
                    privato -> ""
                    else -> scelto
                }
                dati.fase7.invita(idReferente.ifBlank { null }, if (idReferente.isBlank()) idCliente else null, permessi, sedi)
                    .onSuccess { (_, esito) ->
                        avvisi.mostra(if (esito == "domani") "Le email di oggi sono finite: l'invito parte domani" else "Invito mandato a $destinazione")
                        dati.aggiorna()
                        onChiudi()
                    }
                    .onFailure { e -> errore = if (e is java.io.IOException || e.cause is java.io.IOException) "Serve la rete: l'invito parte da qui appena c'è" else e.message ?: "L'invito non è partito: riprova" }
                lavoro = false
            }
        }, altezza = 56.dp, icona = Icone.email, modifier = Modifier.bersaglio("manda-invito"))
    }
}

/** Pubblica anche quelli di prima (§8.1): le cose degli ultimi 12 mesi di un tipo, da scegliere. */
@Composable
private fun FoglioPubblicaPrima(dati: Dati, idCliente: String, onChiudi: () -> Unit) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    var tipo by remember { mutableStateOf("") }
    var proposte by remember { mutableStateOf<List<org.json.JSONObject>?>(null) }
    var scelte by remember { mutableStateOf(setOf<String>()) }
    var errore by remember { mutableStateOf<String?>(null) }
    FoglioDalBasso(onChiudi) {
        Text("Pubblica anche quelli di prima", style = Testi.titoloScheda, color = c.testo)
        PilloleFiltro(listOf("preventivo" to "Preventivi", "contratto" to "Contratti", "rapportino" to "Rapportini", "fattura" to "Fatture", "ticket" to "Richieste"), tipo, { t ->
            tipo = t; proposte = null; scelte = emptySet(); errore = null
            if (dati.esempio) { avvisi.mostra(SOLO_ESEMPIO); return@PilloleFiltro }
            scope.launch { dati.fase7.pubblicaPrima(idCliente, t).onSuccess { proposte = it }.onFailure { errore = it.message ?: "Non si leggono: riprova" } }
        })
        errore?.let { Text(it, style = Testi.secondario, color = c.rossoTesto) }
        val l = proposte
        if (tipo.isNotBlank() && l == null && errore == null && !dati.esempio) Segnaposto(80.dp)
        if (l != null) Column(Modifier.heightIn(max = 360.dp).verticalScroll(rememberScrollState())) {
            if (l.isEmpty()) RigaCalma("Niente degli ultimi 12 mesi")
            l.forEach { p ->
                val id = p.optString("id")
                RigaCasella(p.optString("titolo").ifBlank { p.optString("etichetta").ifBlank { id } }, id in scelte, { scelte = if (id in scelte) scelte - id else scelte + id })
            }
        }
        if (scelte.isNotEmpty()) PulsantePrincipale("Pubblica " + Testo.quanti(scelte.size, "cosa", "cose"), {
            l.orEmpty().filter { it.optString("id") in scelte }.forEach { p -> dati.fase7.pubblica(p.optString("tipo").ifBlank { tipo }, p.optString("id"), conferma = true, prima = true) }
            Giri7.tutto()
            avvisi.mostra("Pubblicate: partono appena c'è rete")
            onChiudi()
        }, altezza = 56.dp)
    }
}
