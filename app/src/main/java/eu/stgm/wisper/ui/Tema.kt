package eu.stgm.wisper.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import eu.stgm.wisper.R

/**
 * I colori della guida (docs/aspetto.md §1), chiaro e scuro.
 *
 * Il chiaro e' quello di base: con molta luce si legge meglio, e il telefono si
 * usa in cantiere. Il giallo Wisper e' lo stesso nei due temi, sempre con testo
 * scuro sopra (12:1), ed e' riservato alle azioni principali e al giorno di oggi.
 */
data class ColoriWisper(
    val scuro: Boolean,
    val fondo: Color,
    val scheda: Color,
    val superficie2: Color,
    val bordoScheda: Color,
    val bordoCampo: Color,
    val riga: Color,
    val testo: Color,
    val testo2: Color,
    val tenue: Color,
    val moltoTenue: Color,
    val giallo: Color = Color(0xFFFFC53D),
    val gialloPremuto: Color = Color(0xFFF2B21E),
    val suGiallo: Color = Color(0xFF1B1B1F),
    val gialloTenue: Color,
    val gialloTesto: Color,
    val firmatoTesto: Color,
    val firmatoFondo: Color,
    val inviatoTesto: Color,
    val inviatoFondo: Color,
    val fatturatoTesto: Color,
    val fatturatoFondo: Color,
    val rossoPieno: Color,
    val rossoTenue: Color,
    val rossoTesto: Color,
    val budget: Color = Color(0xFFE59F00),
    val velo: Color,
)

val Chiaro = ColoriWisper(
    scuro = false,
    fondo = Color(0xFFF4F4F2),
    scheda = Color(0xFFFFFFFF),
    superficie2 = Color(0xFFE7E6E2),
    bordoScheda = Color(0xFFE6E5E1),
    bordoCampo = Color(0xFFCFCEC9),
    riga = Color(0xFFEFEEEB),
    testo = Color(0xFF1B1B1F),
    testo2 = Color(0xFF3F3F46),
    tenue = Color(0xFF5F5F67),
    moltoTenue = Color(0xFF8A8A92),
    gialloTenue = Color(0xFFFFF4D6),
    gialloTesto = Color(0xFF8A5A00),
    firmatoTesto = Color(0xFF1F6A30),
    firmatoFondo = Color(0xFFEBF7EE),
    inviatoTesto = Color(0xFF1E4FA8),
    inviatoFondo = Color(0xFFEAF1FD),
    fatturatoTesto = Color(0xFF3F3F46),
    fatturatoFondo = Color(0xFFE7E6E2),
    rossoPieno = Color(0xFFC92A2A),
    rossoTenue = Color(0xFFFDEEEC),
    rossoTesto = Color(0xFF9B1C1C),
    velo = Color(0x8C000000),
)

val Scuro = ColoriWisper(
    scuro = true,
    fondo = Color(0xFF121214),
    scheda = Color(0xFF1C1C1F),
    superficie2 = Color(0xFF2A2A2E),
    bordoScheda = Color(0xFF2C2C30),
    bordoCampo = Color(0xFF46464D),
    riga = Color(0xFF2A2A2E),
    testo = Color(0xFFF2F2F3),
    testo2 = Color(0xFFD4D4D8),
    tenue = Color(0xFFA1A1AA),
    moltoTenue = Color(0xFF71717A),
    gialloTenue = Color(0xFF3A2F14),
    gialloTesto = Color(0xFFFFD76A),
    firmatoTesto = Color(0xFF8CE0A4),
    firmatoFondo = Color(0xFF1E3326),
    inviatoTesto = Color(0xFF9EC1FF),
    inviatoFondo = Color(0xFF1C2A44),
    fatturatoTesto = Color(0xFFD4D4D8),
    fatturatoFondo = Color(0xFF2A2A2E),
    rossoPieno = Color(0xFFE03131),
    rossoTenue = Color(0xFF3A1C1C),
    rossoTesto = Color(0xFFFFA8A8),
    velo = Color(0xA6000000),
)

/**
 * Figtree (licenza SIL OFL 1.1, testo in assets/licenze/figtree-OFL.txt) e'
 * incluso nell'app: un solo file variabile da cui si prendono i pesi della
 * guida. Lo stesso di Sol: chi usa le due app ritrova gli stessi caratteri.
 */
@OptIn(ExperimentalTextApi::class)
val Figtree: FontFamily = FontFamily(
    listOf(
        400 to FontWeight.Normal,
        500 to FontWeight.Medium,
        600 to FontWeight.SemiBold,
        700 to FontWeight.Bold,
        800 to FontWeight.ExtraBold,
    ).map { (peso, nome) ->
        Font(R.font.figtree, weight = nome, variationSettings = FontVariation.Settings(FontVariation.weight(peso)))
    },
)

/** La scala tipografica della guida (§1). */
object Testi {
    private fun s(dim: Int, peso: FontWeight, spaziatura: Float = 0f, interlinea: Int? = null) = TextStyle(
        fontFamily = Figtree,
        fontSize = dim.sp,
        fontWeight = peso,
        letterSpacing = spaziatura.sp,
        lineHeight = (interlinea ?: (dim * 1.25f).toInt()).sp,
    )

    val titoloPagina = s(30, FontWeight.ExtraBold, -0.6f, 35)
    val titoloScheda = s(22, FontWeight.ExtraBold, -0.3f, 28)
    val titoloSezione = s(18, FontWeight.ExtraBold)
    val numeroGrande = s(28, FontWeight.ExtraBold, -0.4f, 34)
    val totale = s(32, FontWeight.ExtraBold, -0.6f, 38)
    val forte = s(16, FontWeight.ExtraBold, 0f, 21)
    val forteGrande = s(17, FontWeight.ExtraBold, 0f, 22)
    val testo = s(16, FontWeight.Medium, 0f, 23)
    val testoGrande = s(17, FontWeight.Medium, 0f, 25)
    val secondario = s(14, FontWeight.SemiBold, 0f, 19)
    val secondarioGrande = s(15, FontWeight.SemiBold, 0f, 20)
    val piccolo = s(13, FontWeight.SemiBold, 0f, 17)
    val etichetta = s(12, FontWeight.Bold, 0.96f, 16)
    val pulsante = s(18, FontWeight.ExtraBold, 0f, 22)
    val pulsanteSecondario = s(16, FontWeight.Bold, 0f, 20)
    val pillola = s(12, FontWeight.Bold, 0f, 15)
}

val LocalColori = staticCompositionLocalOf { Chiaro }

/** Le scorciatoie per i colori del tema in uso. */
object W {
    val colori: ColoriWisper
        @Composable get() = LocalColori.current
}

/**
 * @param tema "chiaro", "scuro" o "auto" (segue il telefono): si sceglie dalle impostazioni.
 */
@Composable
fun TemaWisper(tema: String = "auto", contenuto: @Composable () -> Unit) {
    val scuro = when (tema) {
        "chiaro" -> false
        "scuro" -> true
        else -> isSystemInDarkTheme()
    }
    ConColori(if (scuro) Scuro else Chiaro, contenuto)
}

/** Forza una tavolozza: la firma resta chiara anche col telefono scuro (il cliente firma su un foglio bianco). */
@Composable
fun ConColori(c: ColoriWisper, contenuto: @Composable () -> Unit) {
    val schema = if (c.scuro) {
        darkColorScheme(
            background = c.fondo, surface = c.scheda, surfaceVariant = c.superficie2,
            surfaceContainer = c.scheda, surfaceContainerHigh = c.scheda, surfaceContainerHighest = c.superficie2,
            primary = c.giallo, onPrimary = c.suGiallo, secondary = c.gialloTesto,
            onBackground = c.testo, onSurface = c.testo, onSurfaceVariant = c.tenue,
            outline = c.bordoCampo, outlineVariant = c.bordoScheda, error = c.rossoPieno,
        )
    } else {
        lightColorScheme(
            background = c.fondo, surface = c.scheda, surfaceVariant = c.superficie2,
            surfaceContainer = c.scheda, surfaceContainerHigh = c.scheda, surfaceContainerHighest = c.superficie2,
            primary = c.suGiallo, onPrimary = Color.White, primaryContainer = c.giallo, onPrimaryContainer = c.suGiallo,
            secondary = c.gialloTesto, onBackground = c.testo, onSurface = c.testo, onSurfaceVariant = c.tenue,
            outline = c.bordoCampo, outlineVariant = c.bordoScheda, error = c.rossoPieno,
        )
    }
    CompositionLocalProvider(LocalColori provides c) {
        MaterialTheme(colorScheme = schema, typography = MaterialTheme.typography.copy(
            bodyLarge = Testi.testo, bodyMedium = Testi.secondario, titleLarge = Testi.titoloScheda,
            titleMedium = Testi.titoloSezione, labelLarge = Testi.pulsanteSecondario,
        ), content = contenuto)
    }
}
