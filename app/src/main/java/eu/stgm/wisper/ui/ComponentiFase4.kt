@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package eu.stgm.wisper.ui

import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import eu.stgm.wisper.Dati
import eu.stgm.wisper.rapportino.ColoreStato
import eu.stgm.wisper.rapportino.ContiFattura
import eu.stgm.wisper.rapportino.ContoBanca
import eu.stgm.wisper.rapportino.Moduli
import eu.stgm.wisper.rapportino.Numeri
import eu.stgm.wisper.rapportino.ParametriFattura
import eu.stgm.wisper.rapportino.RegoleFiscali
import eu.stgm.wisper.rapportino.Stampa
import eu.stgm.wisper.rapportino.dataIt
import kotlinx.coroutines.launch
import java.io.File
import java.time.LocalDate

/*
 * I pezzi comuni di Fatturazione e di Banche e scadenze (fase4.md §13): le parole
 * di stato coi loro colori, la fascia delle regole da confermare, i conti della
 * fattura, la pillola Non collegato, il foglio per segnare un incasso.
 */

/** Gli importi all'italiana: 1.234,56 €; "—" se non si sanno. */
internal fun euro(n: Double?): String = n?.let { Numeri.euro(it) } ?: "—"

/** La parola di stato di fatture, ricevute e impegni, sempre col suo colore (§13). */
@Composable
internal fun PillolaStato4(parola: String, modifier: Modifier = Modifier) {
    if (parola.isBlank()) return
    val c = W.colori
    val (testo, fondo) = when (ColoreStato.di(parola)) {
        ColoreStato.ROSSO -> c.rossoTesto to c.rossoTenue
        ColoreStato.AMBRA -> c.gialloTesto to c.gialloTenue
        ColoreStato.VERDE -> c.firmatoTesto to c.firmatoFondo
        ColoreStato.BLU -> c.inviatoTesto to c.inviatoFondo
        else -> c.fatturatoTesto to c.fatturatoFondo
    }
    Pillolina(parola, testo, fondo, modifier)
}

/** "Da confermare" in giallo scuro: accanto a contributo, ritenuta e bollo finché le regole non sono confermate. */
@Composable
internal fun PillolaDaConfermare() = Pillolina("Da confermare", W.colori.gialloTesto, W.colori.gialloTenue)

/** Quello che non è collegato si vede che non c'è (fase4.md §2.10): grigia, mai un pulsante. */
@Composable
internal fun PillolaNonCollegato() = Pillolina("Non collegato", W.colori.fatturatoTesto, W.colori.fatturatoFondo)

/** Una riga "Invio allo SDI · Non collegato", senza azione. */
@Composable
internal fun RigaNonCollegato(titolo: String) {
    Row(Modifier.fillMaxWidth().heightIn(min = 48.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(titolo, style = Testi.forte.copy(fontWeight = FontWeight.Bold), color = W.colori.testo2, modifier = Modifier.weight(1f))
        PillolaNonCollegato()
    }
}

/** Le regole fiscali delle impostazioni di adesso. */
@Composable
internal fun regoleDi(dati: Dati): RegoleFiscali {
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    return RegoleFiscali.da(ana.impostazioni)
}

/** La fascia gialla tenue in cima finché il commercialista non ha confermato le regole (§3.4). */
@Composable
internal fun FasciaRegole(onApri: (() -> Unit)?) {
    val c = W.colori
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(c.gialloTenue)
            .let { if (onApri != null) it.clickable(onClick = onApri) else it }
            .padding(horizontal = 14.dp, vertical = 10.dp).heightIn(min = 32.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Icon(Icone.avviso, null, tint = c.gialloTesto, modifier = Modifier.size(18.dp))
        Text("Regole delle fatture da confermare col commercialista", style = Testi.secondario.copy(fontWeight = FontWeight.Bold), color = c.gialloTesto, modifier = Modifier.weight(1f))
        if (onApri != null) Text("Apri", style = Testi.secondario.copy(fontWeight = FontWeight.ExtraBold), color = c.collegamento)
    }
}

/** Una riga dei conti: etichetta, eventuale pillola, importo a destra. */
@Composable
private fun RigaConto4(etichetta: String, valore: String, daConfermare: Boolean = false, forte: Boolean = false, tenue: Boolean = false) {
    val c = W.colori
    Row(Modifier.fillMaxWidth().heightIn(min = 30.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        FlowRow(Modifier.weight(1f), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(etichetta, style = if (forte) Testi.forte else Testi.secondarioGrande, color = if (tenue) c.tenue else c.testo2)
            if (daConfermare) PillolaDaConfermare()
        }
        Text(valore, style = if (forte) Testi.forte else Testi.secondarioGrande.copy(fontWeight = FontWeight.Bold), color = if (tenue) c.tenue else c.testo)
    }
}

/**
 * I conti della fattura con le parole fisse di §13: compenso, contributo, IVA, spese
 * anticipate, bollo, totale in grande, ritenuta, netto da incassare.
 */
@Composable
internal fun ContiDellaFattura(k: ContiFattura, p: ParametriFattura, regoleConfermate: Boolean, nota: Boolean = false, anteprima: Boolean = false) {
    val c = W.colori
    val dc = !regoleConfermate
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        RigaConto4("Compenso", euro(k.compenso))
        RigaConto4("Contributo integrativo EPPI ${Numeri.scrivi(p.eppiPercentuale)}%", euro(k.contributo), dc)
        if (p.regime != "forfettario") RigaConto4("IVA ${Numeri.scrivi(p.ivaPercentuale)}%", euro(k.iva))
        if (k.anticipazioni > 0) RigaConto4("Spese anticipate (senza IVA)", euro(k.anticipazioni))
        if (k.bollo > 0) RigaConto4(if (k.bolloAddebitato > 0) "Marca da bollo" else "Marca da bollo (a carico dello studio)", euro(k.bolloAddebitato.takeIf { it > 0 } ?: k.bollo), dc, tenue = k.bolloAddebitato == 0.0)
        Box(Modifier.fillMaxWidth().padding(vertical = 6.dp).height(1.dp).background(c.riga))
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
            Text(if (nota) "Totale della nota" else "Totale della fattura", style = Testi.forte, color = c.testo, modifier = Modifier.weight(1f))
            Text(euro(k.totale), style = Testi.totale.copy(fontSize = 28.sp), color = c.testo)
        }
        if (k.ritenuta > 0) RigaConto4("Ritenuta ${Numeri.scrivi(p.ritenutaPercentuale)}% (la trattiene il cliente)", "− " + euro(k.ritenuta), dc)
        else if (p.regime != "forfettario") RigaConto4(if (p.ritenuta) "Ritenuta: no" else "Ritenuta: no, è un privato", euro(0.0), tenue = true)
        Row(Modifier.fillMaxWidth().padding(top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(if (nota) "Netto stornato" else "Netto da incassare", style = Testi.forteGrande, color = c.testo, modifier = Modifier.weight(1f))
            Text(euro(k.netto), style = Testi.titoloScheda, color = c.testo)
        }
        if (anteprima) Text("Anteprima: i conti li rifà il server quando salvi", style = Testi.piccolo, color = c.tenue)
    }
}

/** Un errore da dire con Riprova. */
@Composable
internal fun SchedaErrore(testo: String, onRiprova: () -> Unit) {
    Scheda(orizzontale = 18.dp, verticale = 16.dp) {
        Text(testo, style = Testi.testo, color = W.colori.testo2)
        PulsanteBordo("Riprova", onRiprova, Modifier.fillMaxWidth(), icona = Icone.riapri)
    }
}

/** Un riquadro coi soldi, toccabile; [rosso] per lo scaduto e il sotto soglia (sempre con la parola nell'etichetta). */
@Composable
internal fun RiquadroEuro(etichetta: String, valore: Double?, modifier: Modifier = Modifier, rosso: Boolean = false, nota: String? = null, onClick: (() -> Unit)? = null) {
    val c = W.colori
    val testo = euro(valore)
    Column(
        modifier.clip(RoundedCornerShape(18.dp)).background(if (rosso) c.rossoTenue else c.scheda)
            .border(1.dp, if (rosso) c.rossoTenue else c.bordoScheda, RoundedCornerShape(18.dp))
            .let { if (onClick != null) it.clickable(onClick = onClick).semantics { role = Role.Button } else it }
            .padding(12.dp).heightIn(min = 48.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Text(etichetta, style = Testi.piccolo.copy(fontWeight = FontWeight.Bold), color = if (rosso) c.rossoTesto else c.tenue, maxLines = 2, overflow = TextOverflow.Ellipsis)
        Text(testo, style = Testi.titoloSezione.copy(fontSize = if (testo.length > 9) 15.sp else 18.sp), color = if (rosso) c.rossoTesto else c.testo, maxLines = 1, overflow = TextOverflow.Ellipsis)
        if (nota != null) Text(nota, style = Testi.piccolo, color = if (rosso) c.rossoTesto else c.tenue, maxLines = 2, overflow = TextOverflow.Ellipsis)
    }
}

/** Il campo grande dell'importo (Segna un incasso): numeri all'italiana, tastiera coi decimali. */
@Composable
internal fun CampoImportoGrande(valore: String, onCambia: (String) -> Unit, errore: String?) {
    val c = W.colori
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        BasicTextField(
            value = valore, onValueChange = { t -> onCambia(t.filter { it.isDigit() || it == ',' || it == '.' }) }, singleLine = true,
            textStyle = Testi.totale.copy(color = c.testo, textAlign = TextAlign.Start), cursorBrush = SolidColor(c.testo),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
            decorationBox = { campo ->
                Row(
                    Modifier.fillMaxWidth().heightIn(min = 64.dp).clip(RoundedCornerShape(16.dp)).background(c.foglio)
                        .border(1.5.dp, if (errore != null) c.rossoPieno else c.bordoCampo, RoundedCornerShape(16.dp)).padding(horizontal = 16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(Modifier.weight(1f)) { campo() }
                    Text("€", style = Testi.titoloScheda, color = c.tenue)
                }
            },
        )
        if (errore != null) Text(errore, style = Testi.secondario, color = c.rossoTesto)
    }
}

/** Il numero scritto all'italiana, al centesimo; null se non è un numero. */
internal fun importoScritto(t: String): Double? = Numeri.leggi(t)?.let { Math.round(it * 100) / 100.0 }

/** "1234.5" -> "1.234,50" senza il simbolo, per riempire un campo. */
internal fun importoNelCampo(n: Double?): String = n?.let { Numeri.euro(it).removeSuffix(" €") } ?: ""

/** I conti come pillole da toccare (Segna un incasso, Nuovo movimento). */
@Composable
internal fun SceltaConto(conti: List<ContoBanca>, scelto: String, onScelto: (String) -> Unit) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        conti.forEach { k -> Pillola(k.nomeCorto, k.id == scelto, { onScelto(k.id) }, altezza = 48.dp) }
    }
}

/** La data come pulsante con bordo: "Oggi, giovedì 22 ottobre" · Cambia. */
@Composable
internal fun PulsanteData(etichetta: String, data: LocalDate, onCambia: (LocalDate) -> Unit) {
    val c = W.colori
    var apri by remember { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(etichetta, style = Testi.secondarioGrande.copy(fontWeight = FontWeight.Bold), color = c.testo)
        Row(
            Modifier.fillMaxWidth().heightIn(min = 54.dp).clip(RoundedCornerShape(16.dp)).background(c.foglio)
                .border(1.5.dp, c.bordoCampo, RoundedCornerShape(16.dp)).clickable { apri = true }.padding(horizontal = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text((if (data == LocalDate.now()) "Oggi, " else "") + giornoEsteso(data), style = Testi.testoGrande, color = c.testo, modifier = Modifier.weight(1f))
            Text("Cambia", style = Testi.pulsanteSecondario, color = c.collegamento)
        }
    }
    if (apri) FinestraGiorno(data, { onCambia(it); apri = false }, { apri = false })
}

/** La casella "L'ho visto sull'estratto conto". */
@Composable
internal fun RigaCasella(testo: String, scelta: Boolean, onCambia: () -> Unit) {
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable(onClick = onCambia).heightIn(min = 52.dp), verticalAlignment = Alignment.CenterVertically) {
        CasellaScelta(scelta, testo, onCambia)
        Text(testo, style = Testi.testo, color = W.colori.testo, modifier = Modifier.weight(1f))
    }
}

/**
 * Segna un incasso o un pagamento (fase4.md §13.2, §13.4): importo grande già scritto
 * col residuo, Tutto · In parte, la data, il conto, "L'ho visto sull'estratto conto",
 * e il giallo. Serve la rete: un incasso non va in coda (il server non ha un idLocale
 * contro i doppioni). Dopo, l'avviso con Annulla (annulla il movimento).
 */
@Composable
internal fun FoglioSegnaSoldi(
    dati: Dati,
    titolo: String,
    sotto: String,
    residuo: Double,
    entrata: Boolean,
    onChiudi: () -> Unit,
    onSegna: suspend (importo: Double, data: LocalDate, idConto: String, verificato: Boolean) -> Result<String>,
    onFatto: () -> Unit,
) {
    val c = W.colori
    val scope = rememberCoroutineScope()
    val avvisi = LocalAvvisi.current
    var testo by remember { mutableStateOf(importoNelCampo(residuo)) }
    var data by remember { mutableStateOf(LocalDate.now()) }
    var conti by remember { mutableStateOf<List<ContoBanca>>(emptyList()) }
    var conto by remember { mutableStateOf("") }
    var verificato by remember { mutableStateOf(false) }
    var errore by remember { mutableStateOf<String?>(null) }
    var inCorso by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        dati.fase4.conti().onSuccess { l -> conti = l.filter { it.attivo }; conto = l.firstOrNull { it.predefinito }?.id ?: l.firstOrNull()?.id.orEmpty() }
    }
    val importo = importoScritto(testo)
    FoglioDalBasso(onChiudi) {
        Text(titolo, style = Testi.titoloScheda, color = c.testo)
        if (sotto.isNotBlank()) Text(sotto, style = Testi.secondarioGrande, color = c.tenue)
        CampoImportoGrande(testo, { testo = it; errore = null }, errore)
        Segmenti(
            listOf(true to "Tutto", false to "In parte"),
            importo != null && Math.abs(importo - residuo) < 0.005,
            { tutto -> if (tutto) testo = importoNelCampo(residuo) else if (importo == residuo) testo = "" },
        )
        PulsanteData("Data", data) { data = it }
        if (conti.size > 1) {
            Etichetta("Conto")
            SceltaConto(conti, conto) { conto = it }
        } else if (conti.size == 1) Text("Sul " + conti[0].nomeCorto, style = Testi.secondarioGrande, color = c.tenue)
        RigaCasella("L'ho visto sull'estratto conto", verificato) { verificato = !verificato }
        PulsantePrincipale(if (inCorso) "Un momento…" else if (entrata) "Segna l'incasso" else "Segna il pagamento", {
            val n = importoScritto(testo)
            when {
                inCorso -> return@PulsantePrincipale
                n == null || n <= 0 -> { errore = "Importo: scrivi quanto"; return@PulsantePrincipale }
                n > residuo + 0.005 -> { errore = (if (entrata) "Restano da incassare " else "Restano da pagare ") + euro(residuo) + ": non puoi segnarne " + euro(n); return@PulsantePrincipale }
            }
            inCorso = true
            scope.launch {
                onSegna(n!!, data, conto, verificato)
                    .onSuccess { idMovimento ->
                        onChiudi()
                        onFatto()
                        avvisi.mostra((if (entrata) "Incasso di " else "Pagamento di ") + euro(n) + " segnato") {
                            ambitoFase3.launch {
                                dati.fase4.annullaMovimento(idMovimento, "annullato subito dopo averlo segnato")
                                    .onSuccess { avvisi.mostra("Annullato"); onFatto() }
                                    .onFailure { avvisi.mostra(spiegaErrore2(it, "Non si è annullato: riprova dai movimenti")) }
                            }
                        }
                    }
                    .onFailure { errore = spiegaErrore2(it, "Non è stato segnato: riprova") }
                inCorso = false
            }
        }, abilitato = !inCorso)
    }
}

/** Il foglio Condividi di Android con un file della cartella dei PDF (prospetto, XML, CSV). */
internal fun condividiFile(ctx: Context, f: File, titolo: String, tipo: String) {
    Stampa.condividi(ctx, f, titolo, tipo)
}

/** Chi può scrivere fatture e banche: il modulo in scrittura (col permesso dei soldi). */
@Composable
internal fun scriveFatture(): Boolean = LocalPermessi.current.modifica(Moduli.FATTURAZIONE)

@Composable
internal fun scriveBanche(): Boolean = LocalPermessi.current.modifica(Moduli.BANCHE)

/** Una riga etichetta · valore, allineati, per le schede di dettaglio. */
@Composable
internal fun RigaDato(etichetta: String, valore: String, colore: Color = W.colori.testo) {
    Row(Modifier.fillMaxWidth().heightIn(min = 28.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(etichetta, style = Testi.secondarioGrande, color = W.colori.tenue, modifier = Modifier.weight(1f))
        Text(valore, style = Testi.secondarioGrande.copy(fontWeight = FontWeight.Bold), color = colore, textAlign = TextAlign.End)
    }
}

/** Le pillole-filtro (Da emettere · Da incassare · Scadute · Tutte): una scelta, sempre visibile. */
@Composable
internal fun <T> PilloleFiltro(opzioni: List<Pair<T, String>>, scelta: T, onScelta: (T) -> Unit) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        opzioni.forEach { (v, nome) ->
            Box(Modifier.semantics { selected = v == scelta; contentDescription = nome }) { Pillola(nome, v == scelta, { onScelta(v) }, altezza = 44.dp) }
        }
    }
}

/** "22/10/2026", o vuoto. */
internal fun dataVista(iso: String): String = if (iso.isBlank()) "" else dataIt(iso)

/** Larghezza fissa per un numero a destra. */
@Composable
internal fun SpazioLargo(dp: Int) = Spacer(Modifier.width(dp.dp))
