package eu.stgm.wisper.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import eu.stgm.wisper.Dati
import eu.stgm.wisper.rapportino.CosaCalendario
import eu.stgm.wisper.rapportino.FeedCalendario
import eu.stgm.wisper.rapportino.FeedCreato
import eu.stgm.wisper.rapportino.Moduli
import kotlinx.coroutines.launch

/*
 * Il calendario in altre app (fase8.md §5 con la §0.3, §15.1): Attività e calendario ›
 * Calendario › ⋯, e Tu. Scarica un file (giallo Scarica il file, poi Condividi) e Sempre
 * aggiornato (gli indirizzi per ICSx⁵, Nuovo indirizzo col bordo). Si scrive solo in Wisper.
 */

@Composable
fun SchermataCalendarioAltre(dati: Dati, nav: Navigatore) {
    val c = W.colori
    val ctx = LocalContext.current
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    val perm = LocalPermessi.current
    val sessione by dati.sessione.collectAsStateWithLifecycle()
    // Tutto lo studio: attivita 2 e non collaboratore (§5.2), come la vista Squadra della fase 2.
    val studio = perm.modifica(Moduli.ATTIVITA) && !sessione.collaboratore && !sessione.esterno
    val vedeScadenze = perm.vede(Moduli.DOCUMENTI)
    var cosa by remember { mutableStateOf("mie") }
    var assenze by remember { mutableStateOf(true) }
    var scadenze by remember { mutableStateOf(false) }
    var scarico by remember { mutableStateOf(false) }
    var giro by remember { mutableStateOf(0) }
    val lettura = rememberLettura(Unit, giro + Giri8.feed * 1000) { dati.fase8.feedCalendario() }
    var nuovo by remember { mutableStateOf(false) }
    var aperto by remember { mutableStateOf<FeedCalendario?>(null) }
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    // Il calendario fuori casa (§0.3): lo dice feedCalendario, o l'impostazione CALENDARIO_PUBBLICO.
    val fuoriCasa = (lettura as? Lettura.Pronta)?.dato?.fuoriCasaAcceso == true || ana.impostazione("CALENDARIO_PUBBLICO").lowercase() in setOf("true", "1", "si", "sì")

    Column(
        Modifier.fillMaxSize().background(c.fondo).verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = 40.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Testata(onIndietro = { nav.indietro() })
        TitoloPagina("Il calendario in altre app")

        // ---- Scarica un file (§5.4): una fotografia di adesso, da importare in Outlook o nel calendario del telefono.
        Scheda(orizzontale = 18.dp, verticale = 16.dp) {
            Text("Scarica un file", style = Testi.titoloSezione, color = c.testo)
            Domanda("Cosa") {
                SceltePillole(listOf("mie" to "Le mie cose") + if (studio) listOf("studio" to "Tutto lo studio") else emptyList(), cosa, { cosa = it })
            }
            RigaCasella("Ferie e assenze", assenze) { assenze = !assenze }
            if (vedeScadenze) RigaCasella("Scadenze", scadenze) { scadenze = !scadenze }
            Text("Da un mese fa a un anno da oggi", style = Testi.secondario, color = c.tenue)
            PulsantePrincipale(if (scarico) "Preparo il file…" else "Scarica il file", {
                if (scarico) return@PulsantePrincipale
                scarico = true
                scope.launch {
                    dati.fase8.esportaCalendario(if (studio) cosa else "mie", assenze, vedeScadenze && scadenze)
                        .onSuccess { (f, eventi) ->
                            avvisi.mostra(if (eventi == 1) "1 impegno nel file" else "$eventi impegni nel file")
                            condividiFile(ctx, f, "Il calendario di Wisper", "text/calendar")
                        }
                        .onFailure { avvisi.mostra(spiegaErrore2(it, "Il file non è arrivato: riprova")) }
                    scarico = false
                }
            }, Modifier.bersaglio("scarica-ics"), icona = Icone.scarica, abilitato = !scarico)
        }

        // ---- Sempre aggiornato (§5.5): un indirizzo per dispositivo, letto da ICSx⁵.
        Scheda(orizzontale = 18.dp, verticale = 16.dp) {
            Text("Sempre aggiornato", style = Testi.titoloSezione, color = c.testo)
            when (lettura) {
                is Lettura.Pronta -> {
                    val l = lettura.dato.feed
                    if (l.isEmpty()) Text("Nessun indirizzo", style = Testi.secondarioGrande, color = c.tenue)
                    l.forEachIndexed { i, f ->
                        if (i > 0) LineaElenco()
                        RigaConPillola(
                            f.nome, f.cosa.visto + " · " + f.letto(), Icone.calendario,
                            pillola = { Parola8(if (f.pubblico) "Fuori casa" else f.parolaDettagli) },
                            onClick = { aperto = f },
                        )
                    }
                }
                else -> StatoLettura(lettura) { giro++ }
            }
            PulsanteBordo("Nuovo indirizzo", { nuovo = true }, Modifier.fillMaxWidth().bersaglio("nuovo-indirizzo"), icona = Icone.piu)
        }

        // ---- Google Calendar e Outlook (§0.3): la strada fuori casa, spenta di base.
        SchedaElenco {
            RigaConPillola(
                "Google Calendar e Outlook",
                if (fuoriCasa) "Con un indirizzo Anche fuori casa: passa da Google" else "Li leggono i server di Google e Microsoft",
                Icone.globo,
                pillola = { if (fuoriCasa) Parola8("Accesa") else PillolaStato8("scelta", "scelta") },
                freccia = false,
                onClick = {
                    avvisi.mostra(
                        if (fuoriCasa) "Crea un indirizzo con Anche fuori casa: gli appuntamenti passano da Google, di base senza dettagli"
                        else "Li leggono i server di Google e Microsoft: serve un indirizzo su internet. Si sceglie in Amministrazione.",
                    )
                },
            )
        }
    }

    if (nuovo) FoglioNuovoIndirizzo(dati, studio, vedeScadenze, fuoriCasa, sessione.utente.nome.substringBefore(' ')) { creato -> nuovo = false; if (creato) { giro++; Giri8.feed++ } }
    aperto?.let { f -> FoglioIndirizzo(dati, f) { tolto -> aperto = null; if (tolto) giro++ } }
}

/**
 * Nuovo indirizzo (§5.5, §15.1): Nome, Cosa, In più, Con i dettagli sì/no, la casella
 * "Anche fuori casa (passa da Google)" solo se il calendario fuori casa è acceso; giallo Crea
 * l'indirizzo. Dopo, nello stesso foglio, l'indirizzo una volta sola, Copia e Apri con ICSx⁵.
 */
@Composable
internal fun FoglioNuovoIndirizzo(dati: Dati, studio: Boolean, vedeScadenze: Boolean, fuoriCasa: Boolean, nomeMio: String, onChiudi: (Boolean) -> Unit) {
    val c = W.colori
    val ctx = LocalContext.current
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    var nome by remember { mutableStateOf(if (nomeMio.isNotBlank()) "Telefono di $nomeMio" else "") }
    var cosa by remember { mutableStateOf("mie") }
    var assenze by remember { mutableStateOf(true) }
    var scadenze by remember { mutableStateOf(false) }
    var dettagli by remember { mutableStateOf(true) }
    var pubblico by remember { mutableStateOf(false) }
    var errore by remember { mutableStateOf<String?>(null) }
    var lavoro by remember { mutableStateOf(false) }
    var creato by remember { mutableStateOf<FeedCreato?>(null) }
    val icsx = remember { Icsx5.installata(ctx) }

    FoglioDalBasso({ onChiudi(creato != null) }) {
        val fatto = creato
        if (fatto != null) {
            Text("Indirizzo creato", style = Testi.titoloScheda, color = c.testo)
            Text(fatto.feed.nome.ifBlank { nome }, style = Testi.forte, color = c.testo)
            TestoFisso(fatto.indirizzo)
            PulsanteBordo("Copia", { copiaTesto(ctx, "Indirizzo del calendario", fatto.indirizzo, avvisi) }, Modifier.fillMaxWidth(), icona = Icone.copia)
            Text(
                (if (fatto.feed.pubblico || pubblico) "Si aggiorna anche fuori casa, passando da Google." else "Si aggiorna quando il telefono è in casa; fuori casa resta l'ultima lettura.") +
                    " Non lo mostriamo più: se lo perdi, ne fai uno nuovo.",
                style = Testi.secondario, color = c.tenue,
            )
            if (icsx) PulsantePrincipale("Apri con ICSx⁵", {
                if (!Icsx5.apri(ctx, fatto.webcal, fatto.indirizzo)) avvisi.mostra("ICSx⁵ non si apre: copia l'indirizzo e incollalo in ICSx⁵")
            }, Modifier.bersaglio("apri-icsx"))
            else PulsantePrincipale("Installa ICSx⁵", { Icsx5.installa(ctx) }, Modifier.bersaglio("apri-icsx"))
            PulsanteTesto("Chiudi", { onChiudi(true) }, Modifier.fillMaxWidth(), colore = c.testo)
            return@FoglioDalBasso
        }
        Text("Nuovo indirizzo", style = Testi.titoloScheda, color = c.testo)
        CampoTesto(nome, { nome = it; errore = null }, "Nome", Modifier.fillMaxWidth(), errore = errore)
        Domanda("Cosa") {
            SceltePillole(listOf("mie" to "Le mie cose") + if (studio) listOf("studio" to "Tutto lo studio") else emptyList(), cosa, { cosa = it })
        }
        Domanda("In più") {
            RigaCasella("Ferie e assenze", assenze) { assenze = !assenze }
            if (vedeScadenze) RigaCasella("Scadenze", scadenze) { scadenze = !scadenze }
        }
        Row(Modifier.fillMaxWidth().heightIn(min = 56.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("Con i dettagli", style = Testi.forte, color = if (pubblico) c.tenue else c.testo)
                Text(if (pubblico) "Fuori casa nasce senza dettagli" else "Clienti, luoghi e note negli eventi", style = Testi.secondario, color = c.tenue)
            }
            Interruttore(dettagli && !pubblico, { if (!pubblico) dettagli = it }, "Con i dettagli")
        }
        if (fuoriCasa) RigaCasella("Anche fuori casa (passa da Google)", pubblico) { pubblico = !pubblico }
        PulsantePrincipale(if (lavoro) "Creo…" else "Crea l'indirizzo", {
            if (lavoro) return@PulsantePrincipale
            if (nome.isBlank()) { errore = "Nome: scrivi un nome per riconoscerlo"; return@PulsantePrincipale }
            lavoro = true
            scope.launch {
                dati.fase8.nuovoFeed(nome, CosaCalendario(if (studio) cosa else "mie", assenze, vedeScadenze && scadenze), dettagli && !pubblico, pubblico)
                    .onSuccess { creato = it }
                    .onFailure { errore = spiegaErrore2(it, "L'indirizzo non è stato creato: riprova") }
                lavoro = false
            }
        }, Modifier.bersaglio("crea-indirizzo"), abilitato = !lavoro)
    }
}

/** Il foglio di un indirizzo: cosa c'è, l'ultima lettura, e Togli l'indirizzo (bordo rosso tenue). */
@Composable
internal fun FoglioIndirizzo(dati: Dati, f: FeedCalendario, onChiudi: (Boolean) -> Unit) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    var lavoro by remember { mutableStateOf(false) }
    FoglioDalBasso({ onChiudi(false) }) {
        Text(f.nome, style = Testi.titoloScheda, color = c.testo)
        if (f.di.isNotBlank()) Coppia("Di", f.di)
        Coppia("Cosa", f.cosa.visto)
        Coppia("Ultima lettura", f.letto())
        Coppia("Letture", f.letture.toString())
        Coppia("Dettagli", f.parolaDettagli + if (f.pubblico) " · anche fuori casa" else "")
        PulsantePericolo(if (lavoro) "Tolgo…" else "Togli l'indirizzo", {
            if (lavoro) return@PulsantePericolo
            lavoro = true
            scope.launch {
                dati.fase8.revocaFeed(f.id)
                    .onSuccess { avvisi.mostra("Indirizzo tolto: chi lo usava non lo legge più"); Giri8.feed++; onChiudi(true) }
                    .onFailure { avvisi.mostra(spiegaErrore2(it, "Non è stato tolto: riprova")) }
                lavoro = false
            }
        }, Modifier.fillMaxWidth())
        PulsanteTesto("Annulla", { onChiudi(false) }, Modifier.fillMaxWidth(), colore = c.testo)
    }
}

/**
 * Una riga col nome, la frase sotto e la pillola sotto la frase (come nel prototipo): con la
 * pillola a destra, su un telefono stretto il nome andava a capo e la frase si tagliava.
 */
@Composable
private fun RigaConPillola(
    titolo: String,
    sotto: String,
    icona: androidx.compose.ui.graphics.vector.ImageVector,
    pillola: @Composable () -> Unit,
    freccia: Boolean = true,
    onClick: () -> Unit,
) {
    val c = W.colori
    Row(
        Modifier.fillMaxWidth().heightIn(min = 64.dp).clickable(onClick = onClick).padding(vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Box(Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(c.superficie2), contentAlignment = Alignment.Center) {
            Icon(icona, null, tint = c.testo, modifier = Modifier.size(20.dp))
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(titolo, style = Testi.forte, color = c.testo, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text(sotto, style = Testi.secondario.copy(fontWeight = FontWeight.Medium), color = c.tenue, maxLines = 3, overflow = TextOverflow.Ellipsis)
            pillola()
        }
        if (freccia) Icon(Icone.freccia, null, tint = c.tenue, modifier = Modifier.size(18.dp))
    }
}
