@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package eu.stgm.wisper.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import eu.stgm.wisper.Dati
import eu.stgm.wisper.rapportino.Attrezzatura
import eu.stgm.wisper.rapportino.ContiMezzi
import eu.stgm.wisper.rapportino.StrumentoUsato
import eu.stgm.wisper.rapportino.dataIt

/*
 * "+ Strumenti usati" nel passo 3 del rapportino (fase6.md §3.9), senza cambiare i tre
 * passi: i miei strumenti come pillole con lo stato della taratura del giorno del
 * rapportino, "Come l'ultima volta qui", "Altro strumento". Lo scaduto si usa solo
 * confermando (la conferma resta scritta), il non conforme e quello al laboratorio non
 * si scelgono (il tocco dice perché). Il server non rifiuta mai un rapportino per uno
 * strumento: il blocco lo fa l'app al momento della scelta.
 */

/** Uno strumento candidato: com'era il giorno del rapportino. */
internal data class Candidato(val id: String, val codice: String, val nome: String, val matricola: String, val verifica: Boolean, val stato: ContiMezzi.StatoTaratura?) {
    fun usato(confermato: Boolean = false) = StrumentoUsato(
        idAttrezzatura = id, codice = codice, nome = nome, matricola = matricola, scadeAllora = stato?.scade.orEmpty(),
        statoAllora = when (stato?.stato) {
            ContiMezzi.VALIDA, ContiMezzi.IN_SCADENZA -> ContiMezzi.VALIDA
            null -> ""
            else -> stato.stato
        },
        confermato = confermato && stato?.stato == ContiMezzi.SCADUTA, verifica = verifica,
    )
}

/** Lo stato della taratura di uno strumento del catalogo in un giorno (il catalogo dà la scadenza, il telefono rifà la parola). */
internal fun statoNelGiorno(a: Attrezzatura, giorno: java.time.LocalDate, preavviso: Int): ContiMezzi.StatoTaratura? {
    val t = a.taratura
    if (t?.stato == ContiMezzi.LABORATORIO || t?.stato == ContiMezzi.NON_CONFORME) return t
    if (a.controllo.isBlank()) return t
    val ultima = if (t?.stato == ContiMezzi.SENZA || t == null) null else ContiMezzi.Ultima("", t.scade, "conforme")
    return ContiMezzi.statoTaratura(a.controllo, ultima, a.fuoriUso, false, giorno, preavviso)
}

@Composable
internal fun StrumentiUsati(stato: ModuloStato, dati: Dati) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    val sessione by dati.sessione.collectAsStateWithLifecycle()
    val viste by dati.viste.collectAsStateWithLifecycle()
    val preavviso = ana.impostazione("TARATURA_PREAVVISO_GIORNI").toIntOrNull() ?: 30
    val blocco = sessione.interfaccia.taraturaBlocco
    var catalogo by remember { mutableStateOf(dati.fase6.attrezzatureLette()) }
    LaunchedEffect(Unit) { dati.fase6.attrezzature().onSuccess { catalogo = it } }
    var scaduto by remember { mutableStateOf<Candidato?>(null) }
    var altro by remember { mutableStateOf(false) }
    val giorno = stato.data

    val miei = ana.mieiStrumenti.filter { it.categoria == "strumento" || it.controllo.isNotBlank() }.map { s ->
        Candidato(s.id, s.codice, s.nome, s.matricola, s.controllo == "verifica", s.statoOggi(giorno, preavviso))
    }
    val dalCatalogo = catalogo.filter { it.categoria == "strumento" && !it.dismesso }.map { a ->
        Candidato(a.id, a.codice, a.nome, a.matricola, a.controllo == "verifica", statoNelGiorno(a, giorno, preavviso))
    }
    val scelti = stato.strumenti.orEmpty()
    val visibili = (miei + scelti.mapNotNull { u -> (dalCatalogo.firstOrNull { it.id == u.idAttrezzatura } ?: Candidato(u.idAttrezzatura, u.codice, u.nome, u.matricola, u.verifica,
        if (u.statoAllora.isBlank()) null else ContiMezzi.StatoTaratura(u.statoAllora, u.statoAllora, null, u.scadeAllora))).takeIf { c2 -> miei.none { it.id == c2.id } } })
        .distinctBy { it.id }

    fun togli(id: String) { stato.strumenti = scelti.filterNot { it.idAttrezzatura == id } }
    fun aggiungi(u: StrumentoUsato) { stato.strumenti = scelti.filterNot { it.idAttrezzatura == u.idAttrezzatura } + u }
    fun tocca(k: Candidato) {
        if (scelti.any { it.idAttrezzatura == k.id }) { togli(k.id); return }
        when (StrumentoUsato.sceltaDi(k.stato, blocco)) {
            StrumentoUsato.Scelta.SI -> aggiungi(k.usato())
            StrumentoUsato.Scelta.CONFERMA -> scaduto = k
            StrumentoUsato.Scelta.NO_NON_CONFORME -> avvisi.mostra("Non conforme: non si usa finché non è tarato di nuovo")
            StrumentoUsato.Scelta.NO_LABORATORIO -> avvisi.mostra("È al laboratorio: non si usa finché non rientra")
            StrumentoUsato.Scelta.NO_BLOCCO -> avvisi.mostra("Con la taratura scaduta non si usa: lo dice l'impostazione dello studio")
        }
    }

    Scheda(orizzontale = 16.dp, verticale = 14.dp, spazio = 10.dp) {
        Etichetta("Strumenti usati")
        // "Come l'ultima volta qui": gli strumenti dell'ultimo rapportino per lo stesso cliente.
        val ultimo = viste.map { it.rapportino }.filter { it.idLocale != stato.base.idLocale && it.idCliente.isNotBlank() && it.idCliente == stato.idCliente && !it.strumenti.isNullOrEmpty() }
            .maxByOrNull { it.data }
        if (ultimo != null && scelti.isEmpty()) {
            Row(
                Modifier.fillMaxWidth().heightIn(min = 52.dp).clip(RoundedCornerShape(14.dp)).background(c.superficie2)
                    .clickable {
                        // Si prendono quelli che si possono usare; uno scaduto chiede la conferma, uno non conforme no.
                        val candidati = ultimo.strumenti.orEmpty().mapNotNull { u -> (miei + dalCatalogo).firstOrNull { it.id == u.idAttrezzatura } }
                        stato.strumenti = candidati.filter { StrumentoUsato.sceltaDi(it.stato, blocco) == StrumentoUsato.Scelta.SI }.map { it.usato() }
                        candidati.firstOrNull { StrumentoUsato.sceltaDi(it.stato, blocco) == StrumentoUsato.Scelta.CONFERMA }?.let { scaduto = it }
                    }.padding(horizontal = 14.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Come l'ultima volta qui: " + ultimo.strumenti.orEmpty().joinToString(", ") { it.nome }, style = Testi.secondario.copy(fontWeight = FontWeight.Bold), color = c.testo2, modifier = Modifier.weight(1f))
                Text("Usa", style = Testi.pulsanteSecondario, color = c.gialloTesto)
            }
        }
        if (visibili.isEmpty()) Text("Non hai strumenti assegnati: cercali nel catalogo.", style = Testi.secondario, color = c.tenue)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            visibili.forEach { k -> PillolaStrumento(k, scelti.firstOrNull { it.idAttrezzatura == k.id }) { tocca(k) } }
        }
        PulsanteTesto("Altro strumento", { altro = true })
    }

    scaduto?.let { k ->
        FoglioDalBasso({ scaduto = null }) {
            Text("Il " + k.nome + " ha la taratura scaduta", style = Testi.titoloScheda, color = c.testo)
            Text("Scaduta il " + dataIt(k.stato?.scade.orEmpty()) + ": le misure potrebbero non valere.", style = Testi.testo, color = c.testo2)
            PulsantePrincipale("Scegli un altro strumento", { scaduto = null })
            PulsanteTesto("Lo uso lo stesso", { aggiungi(k.usato(confermato = true)); scaduto = null }, Modifier.fillMaxWidth(), colore = c.testo)
        }
    }
    if (altro) {
        var cerca by remember { mutableStateOf("") }
        FoglioDalBasso({ altro = false }) {
            Text("Altro strumento", style = Testi.titoloScheda, color = c.testo)
            CampoCerca(cerca, { cerca = it }, "Cerca nel catalogo")
            val trovati = dalCatalogo.filter { cerca.isBlank() || (it.nome + " " + it.codice + " " + it.matricola).contains(cerca, ignoreCase = true) }
            Column(Modifier.heightIn(max = 420.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (trovati.isEmpty()) RigaCalma(if (catalogo.isEmpty()) "Il catalogo si legge quando c'è rete." else "Niente con questo nome.")
                trovati.forEach { k ->
                    RigaVoce(k.nome, sotto = listOf(k.codice, if (k.matricola.isNotBlank()) "matr. ${k.matricola}" else "").filter { it.isNotBlank() }.joinToString(" · "),
                        icona = Icone.misura, fine = { k.stato?.let { Parola6(it.parola, colore = it.colore) } }, onClick = { altro = false; tocca(k) })
                }
            }
        }
    }
}

/** Una pillola dello strumento: il nome e la parola della taratura; nera se scelto, spenta (col motivo al tocco) se non si usa. */
@Composable
private fun PillolaStrumento(k: Candidato, scelto: StrumentoUsato?, onClick: () -> Unit) {
    val c = W.colori
    val spento = k.stato?.spento == true
    Column(
        Modifier.clip(RoundedCornerShape(16.dp)).background(if (scelto != null) c.testo else c.scheda)
            .border(1.5.dp, if (scelto != null) c.testo else c.bordoCampo, RoundedCornerShape(16.dp))
            .clickable(onClick = onClick).semantics { role = Role.Checkbox; selected = scelto != null }
            .alpha(if (spento) 0.55f else 1f).heightIn(min = 56.dp).padding(horizontal = 12.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(k.nome, style = Testi.forte.copy(fontWeight = FontWeight.Bold), color = if (scelto != null) c.scheda else c.testo)
        k.stato?.let { s ->
            val parola = if (scelto?.confermato == true) s.parola + " · confermato" else s.parola
            Parola6(parola, colore = s.colore)
        }
    }
}
