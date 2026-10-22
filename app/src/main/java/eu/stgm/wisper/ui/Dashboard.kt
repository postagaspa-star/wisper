package eu.stgm.wisper.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import kotlinx.coroutines.launch
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import eu.stgm.wisper.Dati
import eu.stgm.wisper.Riepiloghi
import eu.stgm.wisper.rapportino.Collegamento
import eu.stgm.wisper.rapportino.Moduli
import eu.stgm.wisper.rapportino.NumeriCommesse
import eu.stgm.wisper.rapportino.Numeri
import eu.stgm.wisper.rapportino.Rapportino
import eu.stgm.wisper.rapportino.VoceDashboard
import java.time.LocalDate
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.util.Locale

private val IT = Locale.ITALY

/**
 * La Dashboard, la casa di tutti (docs/gestionale/fase1-schermate.md §3): risponde
 * a "cosa devo fare adesso?". Il saluto, "Il tuo giorno" per chi scrive
 * rapportini, la cosa più urgente, Urgenti, Questa settimana, i numeri delle
 * commesse e Da pianificare. Ogni riga porta dove si sistema.
 */
@Composable
fun SchermataDashboard(
    dati: Dati,
    nav: Navigatore,
    onNuovo: (LocalDate) -> Unit,
    onComeIeri: (Rapportino) -> Unit,
) {
    val c = W.colori
    val perm = LocalPermessi.current
    val sessione by dati.sessione.collectAsStateWithLifecycle()
    val dashboard by dati.dashboard.collectAsStateWithLifecycle()
    val aggiornamento by dati.aggiornamento.collectAsStateWithLifecycle()
    val viste by dati.viste.collectAsStateWithLifecycle()
    val oggi = LocalDate.now()
    val nome = sessione.utente.nome.substringBefore(' ').trim()
    val scrive = perm.modifica(Moduli.RAPPORTINI)
    val timer by dati.timer.collectAsStateWithLifecycle()
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    var fermoInCorso by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) { dati.aggiornaDashboard(); if (perm.vede(Moduli.RAPPORTINI)) dati.aggiornaTimer() }

    fun apri(col: Collegamento?) = apriCollegamento(col, nav, viste.map { it.rapportino })

    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp).padding(top = 10.dp, bottom = 90.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            TestataMenu()
            if (scrive) AvvisoRifiuto(dati)
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(oggi.format(DateTimeFormatter.ofPattern("EEEE d MMMM", IT)).replaceFirstChar { it.uppercase() }, style = Testi.secondarioGrande, color = c.tenue)
                Text(Riepiloghi.saluto() + if (nome.isNotBlank()) ", $nome" else "", style = Testi.titoloPagina, color = c.testo)
            }

            // Fase 3: il timer acceso si vede in cima (fase3.md §2, punto 2); Ferma apre la bozza da correggere.
            val t = timer
            if (t?.acceso == true && perm.vede(Moduli.RAPPORTINI)) {
                SchedaTimerAcceso(
                    t,
                    onFerma = {
                        if (!fermoInCorso) {
                            fermoInCorso = true
                            scope.launch {
                                dati.fermaTimer()
                                    .onSuccess { f ->
                                        RicordoOre.riga = f.riga
                                        avvisi.mostra(f.avviso.ifBlank { "Bozza di ${Numeri.ore(f.riga.ore)}: correggila e salva" })
                                        nav.vai("ore-registra/" + f.riga.chiave)
                                    }
                                    .onFailure { avvisi.mostra(spiegaErrore2(it, "Il timer non si è fermato: riprova")) }
                                fermoInCorso = false
                            }
                        }
                    },
                    onApri = { RicordoOre.segmento = SegmentoOre.ORE; nav.sezione(Sezione.RAPPORTINI) },
                    inCorso = fermoInCorso,
                )
            }

            if (scrive) {
                IlTuoGiorno(
                    dati = dati,
                    costi = perm.costi,
                    onNuovo = onNuovo,
                    onComeIeri = onComeIeri,
                    onApri = { nav.apriRapportino(it) },
                    onMese = { nav.sezione(Sezione.RAPPORTINI, FiltroRapportini()) },
                    onDaFirmare = { nav.sezione(Sezione.RAPPORTINI, FiltroRapportini(mese = null, quali = Quali.FIRMARE)) },
                )
            }

            val d = dashboard
            when {
                d == null && aggiornamento.errore.isNotBlank() && !aggiornamento.inCorso -> Scheda(orizzontale = 20.dp, verticale = 18.dp) {
                    Text(aggiornamento.errore, style = Testi.testo, color = c.testo2)
                    PulsanteBordo("Riprova", { dati.aggiorna() }, Modifier.fillMaxWidth(), icona = Icone.riapri)
                }
                d == null -> {
                    Segnaposto(150.dp)
                    Segnaposto(200.dp)
                    Segnaposto(90.dp)
                }
                else -> {
                    // Fase 4 (fase4.md §13.6): quattro riquadri dei soldi per chi vede le fatture, toccabili.
                    val soldi = d.fase4
                    if (soldi != null && (perm.vede(Moduli.FATTURAZIONE) || perm.vede(Moduli.BANCHE))) RiquadriSoldi(soldi, perm) { apri(it) }
                    val prima = d.urgenti.firstOrNull()
                    if (prima != null) CosaPiuUrgente(prima, Modifier.bersaglio("cosa-fare")) { apri(prima.collegamento) }
                    val urgenti = d.urgenti.drop(1)
                    if (urgenti.isNotEmpty()) SezioneDashboard("Urgenti", urgenti, if (prima == null) Modifier.bersaglio("cosa-fare") else Modifier) { apri(it) }
                    if (d.settimana.isNotEmpty()) SezioneDashboard("Questa settimana", d.settimana, Modifier.bersaglio("settimana")) { apri(it) }
                    if (perm.vede(Moduli.COMMESSE)) NumeriDelleCommesse(d.commesse) { filtro -> apri(Collegamento("commesse", filtro = filtro)) }
                    if (d.pianificare.isNotEmpty()) SezioneDashboard("Da pianificare", d.pianificare) { apri(it) }
                    if (d.vuota) NienteDaSistemare(if (prima == null) Modifier.bersaglio("cosa-fare") else Modifier)
                }
            }
        }
        if (scrive) PillolaReteRapportini(dati, Modifier.align(Alignment.BottomCenter))
    }
}

/**
 * Dove porta una riga: la pagina giusta, col filtro giusto. Le pagine sono quelle
 * del server (§12) e quelle che calcola il telefono (rapportino/CosaFare.kt).
 */
fun apriCollegamento(col: Collegamento?, nav: Navigatore, rapportini: List<Rapportino>) {
    if (col == null) return
    val p = col.parametri
    when (col.pagina.lowercase()) {
        "commessa" -> if (col.id.isNotBlank()) {
            // {sezione: "prestazioni"}: la commessa si apre su quella scheda.
            when (p["sezione"]?.lowercase()) {
                "prestazioni" -> RicordoCommesse.schede[col.id] = SchedaDiCommessa.PRESTAZIONI
                "rapportini" -> RicordoCommesse.schede[col.id] = SchedaDiCommessa.RAPPORTINI
                "panoramica" -> RicordoCommesse.schede[col.id] = SchedaDiCommessa.PANORAMICA
            }
            nav.vai("commessa/${col.id}")
        } else nav.sezione(Sezione.COMMESSE)
        "commesse" -> {
            RicordoCommesse.mostra(col.filtro.ifBlank { p["filtro"] ?: p["stato"] ?: "" })
            nav.sezione(Sezione.COMMESSE)
        }
        "cliente", "fornitore", "soggetto" -> if (col.id.isNotBlank()) nav.vai("cliente/${col.id}") else nav.sezione(Sezione.CLIENTI)
        "clienti", "fornitori", "soggetti" -> nav.sezione(Sezione.CLIENTI)
        "rapportini" -> {
            // Fase 3 (§14.13): {segmento: ore | rapportini | daApprovare, giorno}.
            when (p["segmento"]) {
                "daApprovare" -> { RicordoOre.segmento = SegmentoOre.APPROVARE; nav.sezione(Sezione.RAPPORTINI); return }
                "ore" -> {
                    RicordoOre.segmento = SegmentoOre.ORE
                    RicordoOre.giorno = p["giorno"]?.let { runCatching { LocalDate.parse(it.take(10)) }.getOrNull() }
                    nav.sezione(Sezione.RAPPORTINI)
                    return
                }
            }
            val f = col.filtro.lowercase()
            val stato = p["stato"]?.uppercase().orEmpty()
            val mese = p["mese"]?.let { runCatching { YearMonth.parse(it.take(7)) }.getOrNull() }
            nav.sezione(
                Sezione.RAPPORTINI,
                when {
                    f.contains("firm") || stato == "BOZZA" -> FiltroRapportini(mese = mese, quali = Quali.FIRMARE)
                    f.contains("fattur") || stato == "FIRMATO" || stato == "INVIATO" -> FiltroRapportini(mese = mese, quali = Quali.FATTURARE)
                    p["idCommessa"] != null -> FiltroRapportini(mese = mese, idCommessa = p["idCommessa"])
                    p["idCliente"] != null -> FiltroRapportini(mese = mese, idCliente = p["idCliente"])
                    col.id.isNotBlank() && rapportini.none { it.id == col.id } -> FiltroRapportini(mese = null, idCommessa = col.id)
                    mese != null -> FiltroRapportini(mese = mese)
                    else -> FiltroRapportini()
                },
            )
        }
        "rapportino" -> rapportini.firstOrNull { it.id == col.id || it.idLocale == col.id }?.let { nav.apriRapportino(it.idLocale) }
            ?: nav.sezione(Sezione.RAPPORTINI, FiltroRapportini(mese = null, testo = col.id))
        "nuovorapportino", "rapportino-nuovo", "giorno" -> {
            val giorno = runCatching { LocalDate.parse((col.id.ifBlank { col.filtro }).take(10)) }.getOrNull() ?: LocalDate.now()
            nav.nuovoRapportino(giorno)
        }
        // Fase 2 (architettura.md §13.8): preventivi, attività, calendario.
        "preventivo" -> if (col.id.isNotBlank()) nav.vai("preventivo/${col.id}") else nav.sezione(Sezione.PREVENTIVI)
        "preventivi" -> {
            RicordoPreventivi.mostra(p["stato"].orEmpty())
            nav.sezione(Sezione.PREVENTIVI)
        }
        "attivita" -> if (col.id.isNotBlank()) nav.vai("attivita/${col.id}") else {
            if (p["nonAssegnate"] == "true") RicordoAttivita.segmento = QualiAttivita.LIBERE
            else if (p["gruppo"] != null && RicordoAttivita.segmento == QualiAttivita.LIBERE) RicordoAttivita.segmento = QualiAttivita.MIE
            nav.sezione(Sezione.ATTIVITA)
        }
        "calendario" -> nav.vai("calendario/" + (p["giorno"] ?: col.id).orEmpty())
        "fatturazione" -> { RicordoFatture.segmento = SegmentoFatture.DA_FATTURARE; nav.sezione(Sezione.FATTURAZIONE) }
        // Fase 4 (§15.16): fatture, ricevute, scadenziario, movimenti, impegni, conti, situazione.
        "fatture" -> { RicordoFatture.mostra(p["stato"].orEmpty(), p["pagamento"].orEmpty(), p["scadute"] == "true"); nav.sezione(Sezione.FATTURAZIONE) }
        "fattura" -> if (col.id.isNotBlank()) nav.vai("fattura/${col.id}") else nav.sezione(Sezione.FATTURAZIONE)
        "ricevute" -> { RicordoFatture.segmento = SegmentoFatture.RICEVUTE; nav.sezione(Sezione.FATTURAZIONE) }
        "ricevuta" -> if (col.id.isNotBlank()) nav.vai("ricevuta/${col.id}") else { RicordoFatture.segmento = SegmentoFatture.RICEVUTE; nav.sezione(Sezione.FATTURAZIONE) }
        "scadenziario" -> { RicordoBanche.segmento = SegmentoBanche.SCADENZIARIO; RicordoBanche.giorno = p["giorno"].orEmpty(); nav.sezione(Sezione.BANCHE) }
        "movimenti" -> { RicordoBanche.segmento = SegmentoBanche.MOVIMENTI; nav.sezione(Sezione.BANCHE) }
        "impegni" -> { RicordoBanche.segmento = SegmentoBanche.TRIBUTI; RicordoBanche.soloProposte = p["proposte"] == "true"; nav.sezione(Sezione.BANCHE) }
        "conti" -> { RicordoBanche.segmento = SegmentoBanche.CONTI; nav.sezione(Sezione.BANCHE) }
        "situazione" -> { nav.sezione(Sezione.BANCHE); nav.vai("banche-situazione") }
        // Fase 3: Spese e trasferte col segmento; Amministrazione › Veicoli.
        "spese" -> {
            RicordoSpese.segmento = when (p["segmento"]) {
                "trasferte" -> SegmentoSpese.TRASFERTE
                "rimborsi" -> SegmentoSpese.RIMBORSI
                else -> SegmentoSpese.SPESE
            }
            nav.sezione(Sezione.SPESE)
        }
        "amministrazione" -> when (p["sezione"]) {
            "veicoli" -> nav.vai("amm/veicoli")
            "fiscale" -> nav.vai("amm/fiscale")
            else -> nav.sezione(Sezione.AMMINISTRAZIONE)
        }
        "copie" -> nav.vai("amm/copie")
        "utenti" -> nav.vai("amm/utenti")
        "registro" -> nav.vai("amm/registro")
        "cestino" -> nav.vai("amm/cestino")
        "dashboard" -> nav.sezione(Sezione.DASHBOARD)
    }
}

/** La prima voce urgente: fondo giallo chiarissimo, bordo giallo, e un pulsante che fa la cosa. */
@Composable
private fun CosaPiuUrgente(v: VoceDashboard, modifier: Modifier, onFai: () -> Unit) {
    val c = W.colori
    Column(
        modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(c.scelta)
            .border(1.dp, c.giallo, RoundedCornerShape(22.dp)).padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text("LA COSA PIÙ URGENTE", style = Testi.etichetta, color = c.gialloTesto)
        Text(v.titolo, style = Testi.forte.copy(fontSize = 19.sp, lineHeight = 24.sp), color = c.testo)
        val sotto = listOfNotNull(v.dettaglio.takeIf { it.isNotBlank() }, quantoDi(v)).joinToString(" · ")
        if (sotto.isNotBlank()) Text(sotto, style = Testi.secondarioGrande, color = c.tenue)
        PulsanteBordo(azioneDi(v.collegamento), onFai, altezza = 48.dp)
    }
}

/** Il pulsante della cosa più urgente dice cosa fa. */
private fun azioneDi(col: Collegamento?): String = when (col?.pagina?.lowercase()) {
    "fatturazione" -> "Vedi cosa fatturare"
    "fattura" -> "Apri la fattura"
    "fatture" -> "Vedi le fatture"
    "ricevuta", "ricevute" -> "Vedi le fatture ricevute"
    "scadenziario" -> "Apri lo scadenziario"
    "impegni" -> "Vedi i tributi"
    "conti" -> "Aggiorna il saldo"
    "movimenti" -> "Vedi i movimenti"
    "situazione" -> "Vedi la situazione"
    "commessa" -> "Apri la commessa"
    "commesse" -> "Vedi le commesse"
    "cliente", "fornitore", "soggetto" -> "Apri la scheda"
    "rapportini" -> when (col.parametri["segmento"]) {
        "daApprovare" -> "Vedi cosa approvare"
        "ore" -> "Apri le ore"
        else -> "Vedi i rapportini"
    }
    "spese" -> if (col.parametri["segmento"] == "rimborsi") "Vedi i rimborsi" else "Vedi le spese"
    "amministrazione" -> when (col.parametri["sezione"]) {
        "veicoli" -> "Aggiorna i veicoli"
        "fiscale" -> "Apri le impostazioni fiscali"
        else -> "Apri"
    }
    "rapportino" -> "Apri il rapportino"
    "nuovorapportino", "rapportino-nuovo", "giorno" -> "Scrivi il rapportino"
    "copie" -> "Vedi le copie"
    "preventivo" -> "Apri il preventivo"
    "preventivi" -> "Vedi i preventivi"
    "attivita" -> if (col.id.isNotBlank()) "Apri l'attività" else "Vedi le attività"
    "calendario" -> "Apri il calendario"
    else -> "Apri"
}

/** "URGENTI · 3" e una scheda a righe. */
@Composable
private fun SezioneDashboard(nome: String, voci: List<VoceDashboard>, modifier: Modifier = Modifier, onApri: (Collegamento?) -> Unit) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Etichetta("$nome · ${voci.size}")
        Scheda(orizzontale = 18.dp, verticale = 0.dp, raggio = 22.dp, spazio = 0.dp) {
            voci.forEachIndexed { i, v ->
                if (i > 0) LineaElenco()
                RigaDashboard(v) { onApri(v.collegamento) }
            }
        }
    }
}

/** Una riga: icona colorata per gravità, titolo, dettaglio, importo se c'è, freccia. */
@Composable
private fun RigaDashboard(v: VoceDashboard, onClick: () -> Unit) {
    val c = W.colori
    val (fondo, tinta) = when (v.gravita.lowercase()) {
        "urgente" -> c.rossoTenue to c.rossoTesto
        "attenzione" -> c.gialloTenue to c.gialloTesto
        "soldi" -> c.inviatoFondo to c.inviatoTesto
        else -> c.superficie2 to c.testo2
    }
    Row(
        Modifier.fillMaxWidth().heightIn(min = 64.dp).clickable(enabled = v.collegamento != null, onClick = onClick)
            .semantics { role = Role.Button }
            .padding(vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(fondo), contentAlignment = Alignment.Center) {
            Icon(iconaDi(v), null, tint = tinta, modifier = Modifier.size(20.dp))
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(v.titolo, style = Testi.forte, color = c.testo, maxLines = 2, overflow = TextOverflow.Ellipsis)
            if (v.dettaglio.isNotBlank()) Text(v.dettaglio, style = Testi.secondario, color = c.tenue, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
        quantoDi(v)?.let { Text(it, style = Testi.secondarioGrande.copy(fontWeight = FontWeight.ExtraBold), color = c.testo, maxLines = 1) }
        if (v.collegamento != null) Icon(Icone.freccia, null, tint = c.moltoTenue, modifier = Modifier.size(18.dp))
    }
}

/**
 * Il numero a destra: un importo in euro o delle ore. Gli altri (giorni,
 * rapportini) li dice già il titolo ("3 rapportini da far firmare").
 */
private fun quantoDi(v: VoceDashboard): String? {
    val q = v.quanto ?: return null
    return when (v.unita.lowercase()) {
        "euro", "" -> Numeri.euro(q)
        "ore" -> Numeri.ore(q)
        else -> null
    }
}

private fun iconaDi(v: VoceDashboard): ImageVector = when (v.tipo.lowercase()) {
    "scadenza", "giorno", "scaduta" -> Icone.calendario
    "fine" -> Icone.commesse
    "firma", "firmare" -> Icone.firma
    "fatturare", "fatturazione", "soldi", "sdi", "cliente" -> Icone.fatturazione
    "rapportini" -> if (v.gravita == "urgente" || v.titolo.contains("firm")) Icone.firma else Icone.ore
    "commessa" -> if (v.gravita == "urgente") Icone.allarme else Icone.commesse
    "prestazione", "prestazioni" -> Icone.lista
    "responsabile", "persone" -> Icone.clienti
    "copia", "copie" -> Icone.scudo
    "budget" -> if (v.gravita == "urgente") Icone.allarme else Icone.lista
    "preventivo", "preventivi" -> Icone.preventivo
    "appuntamento", "sopralluogo", "agenda" -> Icone.calendario
    "attivita" -> if (v.gravita == "urgente") Icone.allarme else Icone.lista
    // Fase 3 (§14.13)
    "approvare" -> Icone.spunta
    "respinta" -> Icone.allarme
    "timer" -> Icone.orologio
    "rimborsi" -> Icone.fatturazione
    "veicoli" -> Icone.auto
    // Fase 4 (§15.16)
    "fattura", "ricevuta" -> if (v.gravita == "urgente") Icone.allarme else Icone.fatturazione
    "impegno" -> Icone.calendario
    "cassa", "conto" -> Icone.barre
    "fiscale" -> Icone.scudo
    else -> when (v.gravita.lowercase()) {
        "urgente" -> Icone.allarme
        "attenzione" -> Icone.avviso
        "soldi" -> Icone.fatturazione
        else -> Icone.lista
    }
}

/**
 * I soldi della Dashboard (fase4.md §13.6): Da fatturare · Da incassare · Scaduto (in
 * rosso, con la parola) · Nel conto, in due colonne; ognuno apre la sua pagina.
 */
@Composable
private fun RiquadriSoldi(n: eu.stgm.wisper.rapportino.NumeriFase4, perm: eu.stgm.wisper.rapportino.Permessi, onApri: (Collegamento) -> Unit) {
    val fatt = perm.vede(Moduli.FATTURAZIONE)
    val banche = perm.vede(Moduli.BANCHE)
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            RiquadroEuro("Da fatturare", n.daFatturare, Modifier.weight(1f), onClick = if (fatt) ({ onApri(Collegamento("fatturazione")) }) else null)
            RiquadroEuro("Da incassare", n.daIncassare, Modifier.weight(1f), onClick = if (fatt) ({ onApri(Collegamento("fatture", parametri = mapOf("pagamento" to "aperta"))) }) else null)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            val scaduto = (n.scaduto ?: 0.0) > 0
            RiquadroEuro("Scaduto", n.scaduto, Modifier.weight(1f), rosso = scaduto, onClick = if (fatt) ({ onApri(Collegamento("fatture", parametri = mapOf("scadute" to "true"))) }) else null)
            RiquadroEuro("Nel conto", n.saldoConti, Modifier.weight(1f), onClick = if (banche) ({ onApri(Collegamento("scadenziario")) }) else null)
        }
    }
}

/** I quattro numeri delle commesse: ognuno apre l'elenco col filtro giusto. */
@Composable
private fun NumeriDelleCommesse(n: NumeriCommesse, onApri: (String) -> Unit) {
    val c = W.colori
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        listOf(
            Triple(n.aperte, if (n.aperte == 1) "aperta" else "aperte", "aperte"),
            Triple(n.sospese, if (n.sospese == 1) "sospesa" else "sospese", "sospese"),
            Triple(n.inRitardo, "in ritardo", "ritardo"),
            Triple(n.chiuse, if (n.chiuse == 1) "chiusa" else "chiuse", "chiuse"),
        ).forEach { (numero, nome, filtro) ->
            Column(
                Modifier.weight(1f).clip(RoundedCornerShape(18.dp)).background(c.scheda)
                    .border(1.dp, c.bordoScheda, RoundedCornerShape(18.dp))
                    .clickable { onApri(filtro) }
                    .semantics(mergeDescendants = true) { contentDescription = "$numero $nome"; role = Role.Button }
                    .padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                Text(
                    "$numero", style = Testi.numeroGrande.copy(fontSize = 26.sp, letterSpacing = (-0.5).sp),
                    color = if (filtro == "ritardo" && numero > 0) c.rossoPieno else c.testo, maxLines = 1,
                )
                Text(nome, style = Testi.piccolo.copy(fontWeight = FontWeight.Bold), color = c.tenue, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

/** Niente da sistemare: una riga calma con la spunta verde. */
@Composable
private fun NienteDaSistemare(modifier: Modifier) {
    val c = W.colori
    Row(
        modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(c.scheda)
            .border(1.dp, c.bordoScheda, RoundedCornerShape(22.dp)).padding(horizontal = 18.dp, vertical = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(Modifier.size(32.dp).clip(CircleShape).background(c.firmatoFondo), contentAlignment = Alignment.Center) {
            Icon(Icone.spunta, null, tint = c.firmatoTesto, modifier = Modifier.size(18.dp))
        }
        Text("Niente da sistemare oggi", style = Testi.forte.copy(fontWeight = FontWeight.Bold), color = c.testo)
    }
}
