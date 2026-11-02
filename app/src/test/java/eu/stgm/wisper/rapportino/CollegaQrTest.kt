package eu.stgm.wisper.rapportino

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.math.BigInteger
import java.security.KeyPairGenerator
import java.security.SecureRandom
import java.security.interfaces.ECPublicKey
import java.security.spec.ECGenParameterSpec
import java.util.Base64

/**
 * La lettura del testo del QR di Wisper Ufficio (docs/gestionale/collega-qr.md §3):
 * `wisper-collega:1:<id 22 base64url>:<chiave 44 base64url>:<nome urlencoded ≤32>`,
 * e tutto il resto rifiutato. Le chiavi sono vere (P-256 di Java), compresse come
 * le comprime il computer.
 */
class CollegaQrTest {
    private val b64 = Base64.getUrlEncoder().withoutPadding()
    private val caso = SecureRandom()

    private fun idACaso(): String = b64.encodeToString(ByteArray(16).also(caso::nextBytes))

    /** Una chiave pubblica P-256 vera, compressa: 02/03 secondo la parità di Y, poi X su 32 byte. */
    private fun chiaveVera(): String {
        val g = KeyPairGenerator.getInstance("EC").apply { initialize(ECGenParameterSpec("secp256r1")) }
        val w = (g.generateKeyPair().public as ECPublicKey).w
        val x = w.affineX.toByteArray().let { if (it.size > 32) it.copyOfRange(it.size - 32, it.size) else ByteArray(32 - it.size) + it }
        val prefisso = if (w.affineY.testBit(0)) 0x03.toByte() else 0x02.toByte()
        return b64.encodeToString(byteArrayOf(prefisso) + x)
    }

    private fun testo(id: String = idACaso(), chiave: String = chiaveVera(), nome: String = "UFFICIO-PC", versione: String = "1") =
        "wisper-collega:$versione:$id:$chiave:$nome"

    @Test
    fun `un codice del computer si legge, col nome decodificato`() {
        val id = idACaso()
        val chiave = chiaveVera()
        val c = CollegaQr.leggi("wisper-collega:1:$id:$chiave:UFFICIO-PC")
        assertNotNull(c)
        assertEquals(id, c!!.id)
        assertEquals(chiave, c.chiave)
        assertEquals("UFFICIO-PC", c.nome)
        assertEquals(22, c.id.length)
        assertEquals(44, c.chiave.length)
    }

    @Test
    fun `cento chiavi vere di fila passano tutte`() {
        repeat(100) { assertNotNull("giro $it", CollegaQr.leggi(testo())) }
    }

    @Test
    fun `il nome si decodifica come encodeURIComponent, UTF-8 compreso`() {
        assertEquals("PC di Laura", CollegaQr.leggi(testo(nome = "PC%20di%20Laura"))?.nome)
        assertEquals("Caffè 2", CollegaQr.leggi(testo(nome = "Caff%C3%A8%202"))?.nome)
        assertEquals("caffè", CollegaQr.leggi(testo(nome = "caff%c3%a8"))?.nome)
        assertEquals("A:B", CollegaQr.leggi(testo(nome = "A%3AB"))?.nome)
        assertEquals("a-b_c.d!e~f*g'h(i)", CollegaQr.leggi(testo(nome = "a-b_c.d!e~f*g'h(i)"))?.nome)
        // 32 caratteri sì, 33 no.
        assertNotNull(CollegaQr.leggi(testo(nome = "A".repeat(32))))
        assertNull(CollegaQr.leggi(testo(nome = "A".repeat(33))))
        assertNotNull(CollegaQr.leggi(testo(nome = "%C3%A8".repeat(32))))
        assertNull(CollegaQr.leggi(testo(nome = "%C3%A8".repeat(33))))
    }

    @Test
    fun `un nome scritto male o che si legge male si rifiuta`() {
        for (nome in listOf(
            "", "%20%20", // vuoto o solo spazi
            "PC di Laura", "PC+Laura", "A:B", "A/B", "A#B", // non codificati come fa il computer
            "%", "%4", "%G1", "abc%", "%C3", "%C3%28", "%FF", // percentuali rotte, UTF-8 rotto
            "PC%0A", "PC%09", "PC%00", "%7F", // caratteri di controllo
            "PC%E2%80%AEtxt.exe", "PC%E2%80%8B", "%EF%BB%BF", "PC%E2%80%A8", // inversione del verso, invisibili, separatori
            "%EE%80%80", // uso privato
        )) {
            assertNull("nome «$nome»", CollegaQr.leggi(testo(nome = nome)))
        }
    }

    @Test
    fun `un altro QR, un'altra versione o pezzi mancanti si rifiutano`() {
        val id = idACaso()
        val chiave = chiaveVera()
        for (t in listOf(
            null, "", "https://wisper.example/collega", "UFFICIO-PC", "wisper-collega", "wisper-collega:1",
            "wisper-collega:1:$id:$chiave", "wisper-collega:1:$id:$chiave:", "wisper-collega:2:$id:$chiave:PC",
            "wisper-collega:01:$id:$chiave:PC", "Wisper-collega:1:$id:$chiave:PC", "wisper-collega: 1:$id:$chiave:PC",
            " wisper-collega:1:$id:$chiave:PC", "wisper-collega:1:$id:$chiave:PC\n", "wisper-collega:1:$id:$chiave:PC:altro",
            "wisper-collega:1:$chiave:$id:PC", "wisper-collega:1:$id:$chiave:" + "A".repeat(600),
        )) {
            assertNull("testo «$t»", CollegaQr.leggi(t))
        }
    }

    @Test
    fun `id della lunghezza o della forma sbagliata`() {
        val chiave = chiaveVera()
        val buono = idACaso()
        assertNotNull(CollegaQr.leggi(testo(id = buono, chiave = chiave)))
        for (id in listOf(
            buono.dropLast(1), buono + "A", "$buono=", buono.dropLast(2) + "==", // 21, 23 caratteri, col riempimento
            buono.dropLast(1) + "+", buono.dropLast(1) + "/", buono.dropLast(1) + ".", // base64 normale, non url
            "AAAAAAAAAAAAAAAAAAAAAB", // 22 caratteri ma con i bit avanzati: non è come lo scrive il computer
        )) {
            assertFalse("id «$id»", CollegaQr.idValido(id))
            assertNull(CollegaQr.leggi(testo(id = id, chiave = chiave)))
        }
        assertTrue(CollegaQr.idValido("AAAAAAAAAAAAAAAAAAAAAA"))
        assertTrue(CollegaQr.idValido("_____________________w"))
    }

    @Test
    fun `chiave della lunghezza sbagliata, non compressa o fuori dalla curva`() {
        val buona = chiaveVera()
        val byte = Base64.getUrlDecoder().decode(buona)
        assertTrue(CollegaQr.chiaveValida(buona))
        // Lunghezze sbagliate e riempimento.
        for (k in listOf(buona.dropLast(1), buona + "A", buona.dropLast(1) + "=")) assertFalse("chiave «$k»", CollegaQr.chiaveValida(k))
        // Primo byte diverso da 02/03 (04 = non compressa, 00, 05).
        for (p in listOf(0x00, 0x04, 0x05, 0xff)) {
            val k = b64.encodeToString(byteArrayOf(p.toByte()) + byte.copyOfRange(1, 33))
            assertFalse("prefisso $p", CollegaQr.chiaveValida(k))
            assertNull(CollegaQr.leggi(testo(chiave = k)))
        }
        // L'altro prefisso con la stessa X è sempre un punto della curva (l'altra Y).
        val altra = b64.encodeToString(byteArrayOf(if (byte[0] == 0x02.toByte()) 0x03 else 0x02) + byte.copyOfRange(1, 33))
        assertTrue(CollegaQr.chiaveValida(altra))
        // Una X senza punto sulla curva (circa metà delle X): si cerca la prima a partire da 1.
        val p = BigInteger("ffffffff00000001000000000000000000000000ffffffffffffffffffffffff", 16)
        val b = BigInteger("5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604b", 16)
        var x = BigInteger.ONE
        while (true) {
            val destra = x.pow(3).subtract(x.multiply(BigInteger.valueOf(3))).add(b).mod(p)
            // Criterio di Eulero: non è un quadrato se destra^((p-1)/2) = p-1.
            if (destra.modPow(p.subtract(BigInteger.ONE).shiftRight(1), p) == p.subtract(BigInteger.ONE)) break
            x = x.add(BigInteger.ONE)
        }
        val fuori = b64.encodeToString(byteArrayOf(0x02) + x.toByteArray().let { ByteArray(32 - it.size) + it })
        assertFalse("x = $x non è sulla curva", CollegaQr.chiaveValida(fuori))
        // X ≥ p: non è un numero della curva.
        val troppo = b64.encodeToString(byteArrayOf(0x02) + ByteArray(32) { 0xff.toByte() })
        assertFalse(CollegaQr.chiaveValida(troppo))
    }

    @Test
    fun `l'attesa dopo Collega - entrato, scaduto, trenta secondi, la rete`() {
        assertEquals(AttesaComputer.Esito.ENTRATO, AttesaComputer.decidi(StatoComputer.ENTRATO, 1_500))
        assertEquals(AttesaComputer.Esito.ENTRATO, AttesaComputer.decidi(StatoComputer.ENTRATO, 31_000))
        assertEquals(AttesaComputer.Esito.NON_RISPOSTO, AttesaComputer.decidi(StatoComputer.SCADUTO, 3_000))
        assertEquals(AttesaComputer.Esito.ASPETTA, AttesaComputer.decidi(StatoComputer.AUTORIZZATO, 1_500))
        assertEquals(AttesaComputer.Esito.ASPETTA, AttesaComputer.decidi(StatoComputer.AUTORIZZATO, 29_999))
        assertEquals(AttesaComputer.Esito.NON_RISPOSTO, AttesaComputer.decidi(StatoComputer.AUTORIZZATO, 30_000))
        // Un giro senza rete non ferma niente, ma i 30 secondi valgono lo stesso.
        assertEquals(AttesaComputer.Esito.ASPETTA, AttesaComputer.decidi(StatoComputer.RETE, 10_000))
        assertEquals(AttesaComputer.Esito.NON_RISPOSTO, AttesaComputer.decidi(StatoComputer.RETE, 30_000))
        assertEquals(1_500L, AttesaComputer.OGNI_MS)
        assertEquals(30_000L, AttesaComputer.MASSIMO_MS)
    }
}
