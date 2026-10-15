package eu.stgm.wisper.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import eu.stgm.wisper.rapportino.Stato

/** Il titoletto di una parte del modulo. */
@Composable
fun Sezione(titolo: String, modifier: Modifier = Modifier) {
    Text(
        titolo.uppercase(),
        style = MaterialTheme.typography.labelMedium,
        color = Smorzato,
        modifier = modifier.padding(top = 22.dp, bottom = 8.dp),
    )
}

/** Una scheda: il contenitore grigio scuro su cui stanno i campi. */
@Composable
fun Scheda(modifier: Modifier = Modifier, contenuto: @Composable () -> Unit) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(Carta)
            .border(1.dp, Bordo, RoundedCornerShape(16.dp))
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) { contenuto() }
}

@Composable
private fun coloriCampo() = OutlinedTextFieldDefaults.colors(
    focusedBorderColor = Giallo,
    unfocusedBorderColor = Bordo,
    focusedLabelColor = Giallo,
    cursorColor = Giallo,
    disabledTextColor = Bianco.copy(alpha = 0.75f),
    disabledBorderColor = Bordo.copy(alpha = 0.5f),
    disabledLabelColor = Smorzato,
)

@Composable
fun CampoTesto(
    valore: String,
    onCambia: (String) -> Unit,
    etichetta: String,
    modifier: Modifier = Modifier,
    errore: String? = null,
    aiuto: String? = null,
    righe: Int = 1,
    abilitato: Boolean = true,
    tastiera: KeyboardType = KeyboardType.Text,
    suffisso: String? = null,
) {
    OutlinedTextField(
        value = valore,
        onValueChange = onCambia,
        label = { Text(etichetta) },
        modifier = modifier.fillMaxWidth(),
        enabled = abilitato,
        isError = errore != null,
        singleLine = righe == 1,
        minLines = righe,
        suffix = suffisso?.let { { Text(it, color = Smorzato) } },
        supportingText = (errore ?: aiuto)?.let { { Text(it) } },
        keyboardOptions = KeyboardOptions(
            keyboardType = tastiera,
            capitalization = if (tastiera == KeyboardType.Text) KeyboardCapitalization.Sentences else KeyboardCapitalization.None,
        ),
        colors = coloriCampo(),
        shape = RoundedCornerShape(12.dp),
    )
}

/** Un campo numerico: accetta "6,5" come "6.5". Vedi Numeri. */
@Composable
fun CampoNumero(
    valore: String,
    onCambia: (String) -> Unit,
    etichetta: String,
    modifier: Modifier = Modifier,
    errore: String? = null,
    aiuto: String? = null,
    abilitato: Boolean = true,
    suffisso: String? = null,
) = CampoTesto(
    valore = valore,
    // Solo cifre e un separatore: niente lettere incollate per sbaglio.
    onCambia = { nuovo -> if (nuovo.all { it.isDigit() || it == ',' || it == '.' }) onCambia(nuovo) },
    etichetta = etichetta,
    modifier = modifier,
    errore = errore,
    aiuto = aiuto,
    abilitato = abilitato,
    tastiera = KeyboardType.Decimal,
    suffisso = suffisso,
)

/** Una voce di un menu a scelta: il titolo, e sotto qualcosa che la distingue. */
data class Opzione(val id: String, val titolo: String, val sotto: String = "")

/**
 * Un campo in cui si scrive per cercare e si sceglie dall'elenco. Se quello che
 * si e' scritto non c'e', si puo' usare cosi' com'e' ([nuovo]): e' il modo per
 * aggiungere un cliente o una commessa senza uscire dal rapportino.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SceltaConRicerca(
    testo: String,
    onTesto: (String) -> Unit,
    opzioni: List<Opzione>,
    onScelta: (Opzione) -> Unit,
    etichetta: String,
    modifier: Modifier = Modifier,
    errore: String? = null,
    aiuto: String? = null,
    abilitato: Boolean = true,
    nuovo: ((String) -> String)? = null,
) {
    var aperto by remember { mutableStateOf(false) }
    val filtro = testo.trim().lowercase()
    val visibili = opzioni.filter {
        filtro.isEmpty() || it.titolo.lowercase().contains(filtro) || it.sotto.lowercase().contains(filtro)
    }.take(30)
    val esatta = opzioni.any { it.titolo.equals(testo.trim(), ignoreCase = true) }

    ExposedDropdownMenuBox(
        expanded = aperto && abilitato,
        onExpandedChange = { if (abilitato) aperto = it },
        modifier = modifier,
    ) {
        OutlinedTextField(
            value = testo,
            onValueChange = { onTesto(it); aperto = true },
            label = { Text(etichetta) },
            modifier = Modifier.fillMaxWidth().menuAnchor(MenuAnchorType.PrimaryEditable, abilitato),
            enabled = abilitato,
            isError = errore != null,
            singleLine = true,
            supportingText = (errore ?: aiuto)?.let { { Text(it) } },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = aperto) },
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words),
            colors = coloriCampo(),
            shape = RoundedCornerShape(12.dp),
        )
        ExposedDropdownMenu(expanded = aperto && abilitato, onDismissRequest = { aperto = false }) {
            visibili.forEach { o ->
                DropdownMenuItem(
                    text = {
                        Column {
                            Text(o.titolo, style = MaterialTheme.typography.bodyLarge)
                            if (o.sotto.isNotBlank()) Text(o.sotto, color = Smorzato, fontSize = 13.sp)
                        }
                    },
                    onClick = { onScelta(o); aperto = false },
                )
            }
            if (nuovo != null && testo.isNotBlank() && !esatta) {
                DropdownMenuItem(
                    text = { Text(nuovo(testo.trim()), color = Giallo, fontWeight = FontWeight.SemiBold) },
                    onClick = { aperto = false },
                )
            }
            if (visibili.isEmpty() && (nuovo == null || testo.isBlank())) {
                DropdownMenuItem(text = { Text("Nessuna voce", color = Smorzato) }, onClick = { aperto = false }, enabled = false)
            }
        }
    }
}

fun coloreStato(stato: Stato): Color = when (stato) {
    Stato.BOZZA -> Smorzato
    Stato.FIRMATO -> Verde
    Stato.INVIATO -> Blu
    Stato.FATTURATO -> Giallo
    Stato.ANNULLATO -> Rosso
}

@Composable
fun ChipStato(stato: Stato, modifier: Modifier = Modifier) {
    val colore = coloreStato(stato)
    Text(
        stato.etichetta,
        color = colore,
        fontSize = 12.sp,
        fontWeight = FontWeight.SemiBold,
        modifier = modifier
            .clip(RoundedCornerShape(50))
            .background(colore.copy(alpha = 0.14f))
            .padding(horizontal = 10.dp, vertical = 3.dp),
    )
}

/**
 * A che punto e' il rapportino: Bozza -> Firmato -> Inviato -> Fatturato, e una
 * frase che dice cosa manca. Copiata da Pleya, che lo fa bene: chi apre un
 * rapportino vede subito cosa deve fare, senza decifrare un'etichetta.
 */
@Composable
fun BarraAvanzamento(stato: Stato, modifier: Modifier = Modifier) {
    val passi = listOf(Stato.BOZZA, Stato.FIRMATO, Stato.INVIATO, Stato.FATTURATO)
    val indice = passi.indexOf(stato).coerceAtLeast(0)
    Column(modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
            passi.forEachIndexed { i, p ->
                val fatto = i <= indice
                Box(
                    Modifier
                        .size(12.dp)
                        .clip(CircleShape)
                        .background(if (fatto) coloreStato(stato) else Bordo)
                )
                if (i < passi.lastIndex) {
                    Box(
                        Modifier
                            .weight(1f)
                            .height(2.dp)
                            .padding(horizontal = 4.dp)
                            .background(if (i < indice) coloreStato(stato) else Bordo)
                    )
                }
            }
        }
        Spacer(Modifier.height(6.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            passi.forEachIndexed { i, p ->
                Text(
                    p.etichetta,
                    fontSize = 12.sp,
                    color = if (i == indice) Bianco else Smorzato,
                    fontWeight = if (i == indice) FontWeight.SemiBold else FontWeight.Normal,
                )
            }
        }
        Spacer(Modifier.height(8.dp))
        Text(
            when (stato) {
                Stato.BOZZA -> "Si può ancora modificare. Quando è giusto, fallo firmare al cliente."
                Stato.FIRMATO -> "Firmato dal cliente. Il lavoro non si modifica più: le foto delle spese sì."
                Stato.INVIATO -> "Mandato al cliente. Manca solo la fattura."
                Stato.FATTURATO -> "Fatturato. Fatto."
                Stato.ANNULLATO -> "Annullato."
            },
            color = Smorzato,
            fontSize = 14.sp,
        )
    }
}

/** Una riga "etichetta ........ valore" del riepilogo dei conti. */
@Composable
fun RigaConto(etichetta: String, valore: String, forte: Boolean = false, sotto: String? = null) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
        Column(Modifier.weight(1f)) {
            Text(
                etichetta,
                color = if (forte) Bianco else Smorzato,
                fontWeight = if (forte) FontWeight.SemiBold else FontWeight.Normal,
                fontSize = if (forte) 17.sp else 15.sp,
            )
            if (sotto != null) Text(sotto, color = Smorzato.copy(alpha = 0.8f), fontSize = 12.sp)
        }
        Spacer(Modifier.width(12.dp))
        Text(
            valore,
            color = if (forte) Giallo else Bianco,
            fontWeight = if (forte) FontWeight.Bold else FontWeight.Medium,
            fontSize = if (forte) 20.sp else 15.sp,
        )
    }
}
