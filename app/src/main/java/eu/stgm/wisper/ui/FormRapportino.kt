package eu.stgm.wisper.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import eu.stgm.wisper.R
import eu.stgm.wisper.rapportino.Rapportino
import eu.stgm.wisper.rapportino.StatoCommessa
import kotlinx.coroutines.delay

/**
 * Il rapportino che si compila da solo mentre il tecnico parla.
 *
 * E' il momento che conta nel video: la giuria non deve vedere un'AI che
 * parla — quello lo fa Siri dal 2011 — deve vedere i campi che compaiono uno
 * dopo l'altro mentre un uomo racconta la sua giornata. Per questo ogni campo
 * appena riempito si accende di giallo e poi si calma: l'occhio ci va sopra
 * da solo, e si capisce che sta succedendo adesso.
 *
 * Sul buio: lo sfondo dell'app resta nero, ma la scheda no. Un rapportino su
 * nero pieno sembra un terminale e si legge male in ripresa; qui sta su un
 * pannello appena piu' chiaro, con un filo di bordo e righe separate. Stessi
 * quattro colori di sempre, solo con un po' di profondita' sotto.
 *
 * Niente pulsanti: si conferma a voce. La scheda resta finche' il tecnico non
 * dice di salvare.
 */
@Composable
fun FormRapportino(
    rapportino: Rapportino,
    modifier: Modifier = Modifier,
    /**
     * La commessa come la chiama il tecnico ("FV Fara Vicentino"), non come
     * sta nel foglio ("M001"). I codici li conosce il foglio, non lui.
     */
    commessaLeggibile: String? = null,
    /**
     * Il cantiere, per esteso. A schermo ci sta tutto — via, numero, citta' —
     * mentre a voce Wisper dice solo "via Roma a Thiene": leggere un CAP ad
     * alta voce e' rumore, vederlo scritto no.
     */
    indirizzoCommessa: String? = null,
    /** Frase in fondo: cosa Wisper sta chiedendo, o l'esito del salvataggio. */
    messaggio: String = "",
) {
    Column(modifier = modifier.padding(horizontal = 18.dp)) {

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(20.dp))
                // Sfumatura appena percettibile: da sola toglie l'effetto
                // "buco nero" senza introdurre nessun colore nuovo.
                .background(Brush.verticalGradient(listOf(CartaAlta, CartaBassa)))
                .border(1.dp, Bordo, RoundedCornerShape(20.dp))
                .padding(horizontal = 18.dp, vertical = 20.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(
                    stringResource(R.string.scheda_titolo),
                    color = Bianco.copy(alpha = 0.55f),
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 2.4.sp,
                )
                Text(
                    stringResource(R.string.scheda_in_corso),
                    color = Giallo.copy(alpha = 0.65f),
                    fontSize = 11.sp,
                    letterSpacing = 0.6.sp,
                )
            }

            Spacer(Modifier.height(16.dp))

            RigaCampo(stringResource(R.string.campo_cliente), rapportino.cliente)
            Divisore()
            RigaCampo(
                stringResource(R.string.campo_commessa),
                commessaLeggibile ?: rapportino.commessa,
                sotto = indirizzoCommessa,
            )
            Divisore()
            RigaCampo(
                stringResource(R.string.campo_lavoro),
                rapportino.descrizione,
                alto = true,
            )
            Divisore()

            Row(
                modifier = Modifier.fillMaxWidth().padding(top = 2.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                RigaCampo(
                    stringResource(R.string.campo_ore),
                    rapportino.ore?.let(::formatta),
                    modifier = Modifier.weight(1f),
                )
                RigaCampo(
                    stringResource(R.string.campo_km),
                    rapportino.km?.let(::formatta),
                    modifier = Modifier.weight(1f),
                )
                RigaCampo(
                    stringResource(R.string.campo_spese),
                    rapportino.spese?.let { "${formatta(it)} €" },
                    modifier = Modifier.weight(1.2f),
                )
            }
            Divisore()
            // Lo stato si mostra tradotto, ma nel foglio ci va sempre la parola
            // italiana: la colonna la legge chi lavora in ufficio, non chi ha
            // il telefono in inglese.
            RigaCampo(
                stringResource(R.string.campo_stato),
                when (rapportino.statoCommessa) {
                    StatoCommessa.APERTA -> stringResource(R.string.stato_aperta)
                    StatoCommessa.CHIUSA -> stringResource(R.string.stato_chiusa)
                    null -> null
                },
            )
        }

        if (messaggio.isNotBlank()) {
            Spacer(Modifier.height(20.dp))
            Text(
                messaggio,
                color = Giallo,
                fontSize = 19.sp,
                fontWeight = FontWeight.Medium,
                lineHeight = 26.sp,
                modifier = Modifier.padding(horizontal = 4.dp),
            )
        }
    }
}

@Composable
private fun Divisore() {
    Box(
        Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp)
            .height(1.dp)
            .background(Bordo),
    )
}

/**
 * Una riga del rapportino. Si ricorda da sola il valore precedente: quando
 * cambia si accende, senza che chi la usa debba dirle niente.
 */
@Composable
private fun RigaCampo(
    etichetta: String,
    valore: String?,
    modifier: Modifier = Modifier,
    alto: Boolean = false,
    /** Riga secondaria sotto il valore, piu' piccola e smorzata. */
    sotto: String? = null,
) {
    var precedente by remember { mutableStateOf(valore) }
    var appenaCambiato by remember { mutableStateOf(false) }

    LaunchedEffect(valore) {
        if (valore != precedente && !valore.isNullOrBlank()) {
            precedente = valore
            appenaCambiato = true
            delay(1400)
            appenaCambiato = false
        } else {
            precedente = valore
        }
    }

    val pieno = !valore.isNullOrBlank()

    val coloreValore by animateColorAsState(
        targetValue = when {
            appenaCambiato -> Giallo
            pieno -> Bianco
            else -> Bianco.copy(alpha = 0.26f)
        },
        animationSpec = tween(if (appenaCambiato) 160 else 700),
        label = "colore $etichetta",
    )

    val sfondo by animateFloatAsState(
        targetValue = if (appenaCambiato) 0.12f else 0f,
        animationSpec = tween(if (appenaCambiato) 160 else 900),
        label = "sfondo $etichetta",
    )

    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(Giallo.copy(alpha = sfondo))
            .padding(horizontal = 8.dp, vertical = 8.dp),
    ) {
        Text(
            etichetta.uppercase(),
            color = Bianco.copy(alpha = 0.5f),
            fontSize = 10.sp,
            letterSpacing = 1.2.sp,
            fontWeight = FontWeight.Medium,
        )
        Spacer(Modifier.height(2.dp))
        Text(
            text = valore?.takeIf { it.isNotBlank() } ?: "—",
            color = coloreValore,
            fontSize = if (alto) 20.sp else 24.sp,
            lineHeight = if (alto) 26.sp else 30.sp,
            fontWeight = FontWeight.SemiBold,
            maxLines = if (alto) 3 else 1,
        )
        if (!sotto.isNullOrBlank() && pieno) {
            Text(
                text = sotto,
                color = Bianco.copy(alpha = 0.42f),
                fontSize = 13.sp,
                lineHeight = 17.sp,
                maxLines = 2,
            )
        }
    }
}

/** "4.0" -> "4", "3.5" -> "3,5". Nel form si legge come lo scriverebbe a mano. */
private fun formatta(n: Double): String =
    if (n % 1.0 == 0.0) n.toInt().toString() else n.toString().replace('.', ',')

// Stessa palette di sempre: nero, bianco, giallo, blu. CartaAlta e CartaBassa
// non sono colori nuovi, sono lo stesso nero schiarito quel tanto che basta a
// staccare la scheda dallo sfondo.
private val Bianco = Color(0xFFF2F4F7)
private val Giallo = Color(0xFFFFC53D)
private val CartaAlta = Color(0xFF161A22)
private val CartaBassa = Color(0xFF0E1116)
private val Bordo = Color(0xFF262C38)
