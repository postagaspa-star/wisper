package eu.stgm.wisper.rapportino

import com.google.zxing.BinaryBitmap
import com.google.zxing.DecodeHintType
import com.google.zxing.RGBLuminanceSource
import com.google.zxing.common.HybridBinarizer
import com.google.zxing.qrcode.QRCodeReader
import org.json.JSONArray
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.io.File

/**
 * La prova incrociata col codificatore del computer (docs/gestionale/collega-qr.md §3):
 * pc/ui/qr.js, scritto a mano senza librerie, produce le matrici di
 * pc/prove/qr-campioni.json ({testo, versione, matrice: ["0101…", …]}). Qui ogni
 * matrice diventa un'immagine (modulo di 8 px, zona di silenzio di 4 moduli, nero
 * su bianco come l'SVG della pagina) e la legge ZXing core: il testo deve tornare
 * identico. Due letture: quella della norma (RGBLuminanceSource, HybridBinarizer,
 * QRCodeReader) e quella della fotocamera dell'app (LettoreQrZxing sul piano Y),
 * anche con l'immagine girata come la vede un telefono tenuto in verticale.
 * Senza il file la prova si salta.
 */
class QrIncrociatoTest {
    private val modulo = 8
    private val silenzio = 4

    private fun campioni(): JSONArray? =
        listOf("../pc/prove/qr-campioni.json", "pc/prove/qr-campioni.json").map(::File).firstOrNull { it.exists() }
            ?.let { JSONArray(it.readText(Charsets.UTF_8)) }

    private class Immagine(val lato: Int, val scuro: (Int, Int) -> Boolean) {
        fun argb(): IntArray = IntArray(lato * lato) { i -> if (scuro(i % lato, i / lato)) 0xFF000000.toInt() else 0xFFFFFFFF.toInt() }
        fun luminanza(): ByteArray = ByteArray(lato * lato) { i -> if (scuro(i % lato, i / lato)) 0 else 0xFF.toByte() }
        /** Girata di 90° in senso orario. */
        fun girata(): Immagine = Immagine(lato) { x, y -> scuro(y, lato - 1 - x) }
    }

    /** La matrice disegnata come la disegna la pagina: moduli quadrati interi, bianco intorno. */
    private fun disegna(matrice: List<String>): Immagine {
        val n = matrice.size
        matrice.forEach { assertEquals("matrice quadrata", n, it.length) }
        val lato = (n + 2 * silenzio) * modulo
        return Immagine(lato) { x, y ->
            val c = x / modulo - silenzio
            val r = y / modulo - silenzio
            r in 0 until n && c in 0 until n && matrice[r][c] == '1'
        }
    }

    private fun conQRCodeReader(img: Immagine): String {
        val sorgente = RGBLuminanceSource(img.lato, img.lato, img.argb())
        return QRCodeReader().decode(BinaryBitmap(HybridBinarizer(sorgente)), mapOf(DecodeHintType.CHARACTER_SET to "UTF-8")).text
    }

    @Test
    fun `ogni matrice di qr js si legge con ZXing e il testo torna identico`() {
        val c = campioni()
        assumeTrue("Manca pc/prove/qr-campioni.json (lo scrive pc/ui/qr.js)", c != null)
        assertTrue("almeno 6 campioni", c!!.length() >= 6)
        val lettore = LettoreQrZxing()
        for (i in 0 until c.length()) {
            val o = c.getJSONObject(i)
            val testo = o.getString("testo")
            val versione = o.getInt("versione")
            val righe = o.getJSONArray("matrice").let { a -> List(a.length()) { a.getString(it) } }
            assertEquals("versione $versione: ${17 + 4 * versione} moduli di lato", 17 + 4 * versione, righe.size)
            val img = disegna(righe)
            assertEquals("QRCodeReader, versione $versione", testo, conQRCodeReader(img))
            // La strada della fotocamera: luminanza a un byte per pixel, solo QR, nessun suggerimento sulla codifica.
            assertEquals("lettore dell'app, versione $versione", testo, lettore.leggi(img.luminanza(), img.lato, img.lato))
            val girata = img.girata()
            assertEquals("lettore dell'app, girata, versione $versione", testo, lettore.leggi(girata.luminanza(), girata.lato, girata.lato))
        }
    }

    @Test
    fun `i campioni del collegamento passano la lettura del telefono, col nome giusto`() {
        val c = campioni()
        assumeTrue("Manca pc/prove/qr-campioni.json (lo scrive pc/ui/qr.js)", c != null)
        val nostri = (0 until c!!.length()).map { c.getJSONObject(it).getString("testo") }.filter { it.startsWith("wisper-collega:") }
        assertTrue("ci sono campioni del collegamento", nostri.isNotEmpty())
        for (t in nostri) {
            val codice = CollegaQr.leggi(t)
            assertNotNull("il telefono accetta «$t»", codice)
            assertEquals(java.net.URLDecoder.decode(t.split(':')[4].replace("+", "%2B"), "UTF-8"), codice!!.nome)
        }
    }
}
