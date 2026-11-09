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
 * I colori del design Fai (docs/gestionale/fai.md §3), chiaro e scuro.
 *
 * Il chiaro e' quello di base: con molta luce si legge meglio, e il telefono si
 * usa in cantiere. Fondo bianco, schede grigie senza bordo. Il giallo Wisper e' lo
 * stesso nei due temi, sempre con testo scuro sopra, ed e' riservato alla cosa piu'
 * importante e all'azione principale di ogni pagina.
 */
data class ColoriWisper(
    val scuro: Boolean,
    val fondo: Color,
    /** Le schede: grigio chiaro, senza bordo. */
    val scheda: Color,
    /** Fogli, finestre e campi: bianchi anche sopra una scheda. */
    val foglio: Color,
    val superficie2: Color,
    val bordoScheda: Color,
    val bordoCampo: Color,
    val riga: Color,
    val testo: Color,
    val testo2: Color,
    val tenue: Color,
    val moltoTenue: Color,
    /** I collegamenti e le scritte toccabili ("Cambia", "Vedi tutto"). */
    val collegamento: Color,
    /** La riga in basso del menu laterale. */
    val lato: Color,
    val giallo: Color = Color(0xFFFFC53D),
    val gialloPremuto: Color = Color(0xFFF2B21E),
    val suGiallo: Color = Color(0xFF1A1A1A),
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
    // ---- il gestionale (fase 1, docs/prototipo/Gestionale-fase1.html) ----
    /** Il cerchio con le iniziali di chi e' entrato, e di utenti e referenti. */
    val ambraFondo: Color = Color(0xFFFBF3E3),
    val ambraTesto: Color = Color(0xFF8A5A12),
    /** Il fondo della "cosa piu' urgente" e delle righe scelte. */
    val scelta: Color = Color(0xFFFFF8E5),
    /** Il velo del menu laterale: nero al 45%, al 60% nel tema scuro. */
    val veloMenu: Color = Color(0x73000000),
    // ---- fase 3 (docs/prototipo/Gestionale-fase3.html): la pillola "Mia" delle spese
    val violaFondo: Color = Color(0xFFF1ECFE),
    val violaTesto: Color = Color(0xFF5532C9),
)

val Chiaro = ColoriWisper(
    scuro = false,
    fondo = Color(0xFFFFFFFF),
    scheda = Color(0xFFF4F5F7),
    foglio = Color(0xFFFFFFFF),
    superficie2 = Color(0xFFECEEF2),
    bordoScheda = Color.Transparent,
    bordoCampo = Color(0xFFD5D7DC),
    riga = Color(0xFFE4E7EC),
    testo = Color(0xFF16171B),
    testo2 = Color(0xFF44474F),
    tenue = Color(0xFF5C606A),
    moltoTenue = Color(0xFF8B8F98),
    collegamento = Color(0xFF2F48D9),
    lato = Color(0xFFF7F8FA),
    gialloTenue = Color(0xFFFFF4D6),
    gialloTesto = Color(0xFF8A5A00),
    firmatoTesto = Color(0xFF0B5F37),
    firmatoFondo = Color(0xFFE0F6EC),
    inviatoTesto = Color(0xFF2F48D9),
    inviatoFondo = Color(0xFFE6EAFF),
    fatturatoTesto = Color(0xFF44474F),
    fatturatoFondo = Color(0xFFECEEF2),
    rossoPieno = Color(0xFFD92D20),
    rossoTenue = Color(0xFFFDE3E1),
    rossoTesto = Color(0xFFB42318),
    velo = Color(0x8C000000),
)

val Scuro = ColoriWisper(
    scuro = true,
    fondo = Color(0xFF121316),
    scheda = Color(0xFF1E2025),
    foglio = Color(0xFF191B1F),
    superficie2 = Color(0xFF2A2D33),
    bordoScheda = Color.Transparent,
    bordoCampo = Color(0xFF4A4D55),
    riga = Color(0xFF2C2F35),
    testo = Color(0xFFF2F3F5),
    testo2 = Color(0xFFD3D5DB),
    tenue = Color(0xFFA4A8B2),
    moltoTenue = Color(0xFF767A84),
    collegamento = Color(0xFF9DB0FF),
    lato = Color(0xFF17191D),
    gialloTenue = Color(0xFF3A2F14),
    gialloTesto = Color(0xFFFFD76A),
    firmatoTesto = Color(0xFF7FE3B4),
    firmatoFondo = Color(0xFF14352A),
    inviatoTesto = Color(0xFF9DB0FF),
    inviatoFondo = Color(0xFF1F2748),
    fatturatoTesto = Color(0xFFD3D5DB),
    fatturatoFondo = Color(0xFF2A2D33),
    rossoPieno = Color(0xFFE03131),
    rossoTenue = Color(0xFF3A1C1C),
    rossoTesto = Color(0xFFFFA8A8),
    velo = Color(0xA6000000),
    ambraFondo = Color(0xFF33281A),
    ambraTesto = Color(0xFFF2C27A),
    scelta = Color(0xFF2A2414),
    veloMenu = Color(0x99000000),
    violaFondo = Color(0xFF2A2340),
    violaTesto = Color(0xFFC4B5FD),
)

/**
 * Plus Jakarta Sans (licenza SIL OFL 1.1, testo in assets/licenze/plus-jakarta-sans-OFL.txt)
 * e' incluso nell'app: un solo file variabile da cui si prendono i pesi della guida.
 * I PDF restano in Figtree (fai.md §8), come i documenti gia' mandati ai clienti.
 */
@OptIn(ExperimentalTextApi::class)
val Carattere: FontFamily = FontFamily(
    listOf(
        400 to FontWeight.Normal,
        500 to FontWeight.Medium,
        600 to FontWeight.SemiBold,
        700 to FontWeight.Bold,
        800 to FontWeight.ExtraBold,
    ).map { (peso, nome) ->
        Font(R.font.plus_jakarta_sans, weight = nome, variationSettings = FontVariation.Settings(FontVariation.weight(peso)))
    },
)

/** La scala tipografica della guida (§1). */
object Testi {
    private fun s(dim: Int, peso: FontWeight, spaziatura: Float = 0f, interlinea: Int? = null) = TextStyle(
        fontFamily = Carattere,
        fontSize = dim.sp,
        fontWeight = peso,
        letterSpacing = spaziatura.sp,
        lineHeight = (interlinea ?: (dim * 1.25f).toInt()).sp,
    )

    val titoloCasa = s(32, FontWeight.ExtraBold, -0.8f, 38)
    val titoloPagina = s(30, FontWeight.ExtraBold, -0.6f, 35)
    val sezioneCasa = s(20, FontWeight.ExtraBold, -0.3f, 25)
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
    val etichetta = s(12, FontWeight.ExtraBold, 0.96f, 16)
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
            background = c.fondo, surface = c.foglio, surfaceVariant = c.superficie2,
            surfaceContainer = c.foglio, surfaceContainerHigh = c.foglio, surfaceContainerHighest = c.superficie2,
            primary = c.giallo, onPrimary = c.suGiallo, secondary = c.gialloTesto,
            onBackground = c.testo, onSurface = c.testo, onSurfaceVariant = c.tenue,
            outline = c.bordoCampo, outlineVariant = c.riga, error = c.rossoPieno,
        )
    } else {
        lightColorScheme(
            background = c.fondo, surface = c.foglio, surfaceVariant = c.superficie2,
            surfaceContainer = c.foglio, surfaceContainerHigh = c.foglio, surfaceContainerHighest = c.superficie2,
            primary = c.suGiallo, onPrimary = Color.White, primaryContainer = c.giallo, onPrimaryContainer = c.suGiallo,
            secondary = c.gialloTesto, onBackground = c.testo, onSurface = c.testo, onSurfaceVariant = c.tenue,
            outline = c.bordoCampo, outlineVariant = c.riga, error = c.rossoPieno,
        )
    }
    CompositionLocalProvider(LocalColori provides c) {
        MaterialTheme(colorScheme = schema, typography = MaterialTheme.typography.copy(
            bodyLarge = Testi.testo, bodyMedium = Testi.secondario, titleLarge = Testi.titoloScheda,
            titleMedium = Testi.titoloSezione, labelLarge = Testi.pulsanteSecondario,
        ), content = contenuto)
    }
}
