package eu.stgm.wisper.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

// Gli stessi quattro colori del primo Wisper (nero, bianco, giallo, blu), con
// due grigi per staccare le schede dallo sfondo e due colori di stato. Decisi
// a mano e non presi dallo sfondo del telefono: un rapportino si deve leggere
// uguale su qualunque telefono.
val Nero = Color(0xFF07080A)
val Bianco = Color(0xFFF2F4F7)
val Giallo = Color(0xFFFFC53D)
val Blu = Color(0xFF3D8BFF)
val Carta = Color(0xFF14181F)
val CartaAlta = Color(0xFF1B2029)
val Bordo = Color(0xFF2A303C)
val Smorzato = Color(0xFF8A93A3)
val Rosso = Color(0xFFFF6B5E)
val Verde = Color(0xFF4CC38A)

private val Schema = darkColorScheme(
    background = Nero,
    surface = Carta,
    surfaceVariant = CartaAlta,
    surfaceContainer = Carta,
    surfaceContainerHigh = CartaAlta,
    surfaceContainerHighest = CartaAlta,
    primary = Giallo,
    onPrimary = Nero,
    secondary = Blu,
    onSecondary = Nero,
    onBackground = Bianco,
    onSurface = Bianco,
    onSurfaceVariant = Smorzato,
    outline = Bordo,
    outlineVariant = Bordo,
    error = Rosso,
)

// Caratteri un po' piu' grandi del normale: il modulo si compila anche in
// piedi, in cantiere, con la luce che c'e'.
private val Caratteri = Typography(
    titleLarge = TextStyle(fontSize = 24.sp, fontWeight = FontWeight.SemiBold, lineHeight = 30.sp),
    titleMedium = TextStyle(fontSize = 18.sp, fontWeight = FontWeight.SemiBold, lineHeight = 24.sp),
    bodyLarge = TextStyle(fontSize = 17.sp, lineHeight = 24.sp),
    bodyMedium = TextStyle(fontSize = 15.sp, lineHeight = 21.sp),
    labelLarge = TextStyle(fontSize = 16.sp, fontWeight = FontWeight.SemiBold),
    labelMedium = TextStyle(fontSize = 13.sp, fontWeight = FontWeight.Medium, letterSpacing = 0.6.sp),
)

@Composable
fun TemaWisper(contenuto: @Composable () -> Unit) {
    MaterialTheme(colorScheme = Schema, typography = Caratteri, content = contenuto)
}
