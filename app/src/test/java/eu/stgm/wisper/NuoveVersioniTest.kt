package eu.stgm.wisper

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.security.KeyPairGenerator
import java.security.Signature
import java.security.spec.ECGenParameterSpec
import java.util.Base64

/**
 * La firma dell'elenco delle versioni: è quello che impedisce a chiunque altro
 * di far installare qualcosa sul telefono. Le chiavi qui sono di prova, create
 * al momento: la privata vera non è nel repo.
 */
class NuoveVersioniTest {

    private val coppia = KeyPairGenerator.getInstance("EC").apply { initialize(ECGenParameterSpec("secp256r1")) }.generateKeyPair()
    private val pubblica = Base64.getEncoder().encodeToString(coppia.public.encoded)

    private fun firma(testo: String): String = Base64.getEncoder().encodeToString(
        Signature.getInstance("SHA256withECDSA").run {
            initSign(coppia.private)
            update(testo.toByteArray(Charsets.UTF_8))
            sign()
        }
    )

    private val manifesto = """{"android":{"codice":4,"nome":"0.4.0","url":"https://github.com/x/wisper.apk","sha256":"${"a".repeat(64)}","dimensione":10}}"""

    @Test
    fun firmaGiustaValida() {
        assertTrue(NuoveVersioni.firmaValida(manifesto, firma(manifesto), pubblica))
    }

    @Test
    fun elencoCambiatoDopoLaFirmaRifiutato() {
        val firmato = firma(manifesto)
        val cambiato = manifesto.replace("https://github.com/x/wisper.apk", "https://altrove.example/virus.apk")
        assertFalse(NuoveVersioni.firmaValida(cambiato, firmato, pubblica))
    }

    @Test
    fun firmaDiUnAltraChiaveRifiutata() {
        // Firmato con la chiave di prova, controllato con la chiave vera dell'app.
        assertFalse(NuoveVersioni.firmaValida(manifesto, firma(manifesto)))
    }

    @Test
    fun senzaFirmaOFirmaRottaRifiutato() {
        assertFalse(NuoveVersioni.firmaValida(manifesto, "", pubblica))
        assertFalse(NuoveVersioni.firmaValida(manifesto, "non-base64!!", pubblica))
        assertFalse(NuoveVersioni.firmaValida("", firma(manifesto), pubblica))
    }

    @Test
    fun leggeIlFileComeLoScriveLoStrumento() {
        val (m, f) = NuoveVersioni.leggi("""{"manifesto": ${org.json.JSONObject.quote(manifesto)}, "firma": "abc"}""")
        assertEquals(manifesto, m)
        assertEquals("abc", f)
    }
}
