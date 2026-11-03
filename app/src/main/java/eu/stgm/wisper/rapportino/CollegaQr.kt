package eu.stgm.wisper.rapportino

import java.math.BigInteger
import java.nio.ByteBuffer
import java.nio.charset.CharacterCodingException
import java.nio.charset.CodingErrorAction
import java.util.Base64

/**
 * Il codice QR che Wisper Ufficio mostra nella pagina di accesso, letto dal
 * telefono (docs/gestionale/collega-qr.md §3). Nel codice non c'è niente di
 * segreto: un numero a caso ([id]) e la chiave pubblica del computer ([chiave]),
 * più il nome del computer da mostrare nel foglio di conferma.
 */
data class CodiceCollega(
    /** 16 byte casuali in base64url senza `=`: 22 caratteri. */
    val id: String,
    /** La chiave pubblica P-256 compressa (33 byte, `02`/`03` + X) in base64url: 44 caratteri. */
    val chiave: String,
    /** Il nome del computer già decodificato ("UFFICIO-PC"), da 1 a 32 caratteri. */
    val nome: String,
)

/**
 * La lettura del testo del QR, senza fotocamera né rete (per le prove JVM).
 *
 * Accetta solo `wisper-collega:1:<id>:<chiave>:<nome>` e rifiuta tutto il resto:
 * un altro QR, una versione diversa da 1, id o chiave della lunghezza sbagliata.
 * Più severa dell'accordo dove costa poco (le decisioni sono in fondo a
 * collega-qr.md): la chiave deve essere un punto vero della curva P-256, il
 * base64url deve essere quello che scriverebbe il computer, il nome non può
 * avere caratteri di controllo né caratteri invisibili che girano il testo (un
 * nome che sul foglio di conferma si legge diverso da com'è).
 */
object CollegaQr {
    const val PREFISSO = "wisper-collega"
    const val VERSIONE = "1"

    /** La riga che resta sotto la finestra quando si inquadra un altro QR. */
    const val NON_E_WISPER = "Questo non è un codice di Wisper Ufficio"

    /** Lunghezze del testo dell'accordo (§3). */
    const val LUNGHEZZA_ID = 22
    const val LUNGHEZZA_CHIAVE = 44
    const val NOME_MASSIMO = 32

    /** Un testo più lungo di così non è un nostro codice (il nome codificato al massimo è 32 × 12 caratteri). */
    private const val TESTO_MASSIMO = 512

    private val BASE64URL = Regex("^[A-Za-z0-9_-]+$")

    /** I caratteri che encodeURIComponent (e Uri.EscapeDataString di .NET) lasciano come sono. */
    private const val NON_CODIFICATI = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.!~*'()"

    /** Il codice, o null se il testo non è un QR di Wisper Ufficio valido. */
    fun leggi(testo: String?): CodiceCollega? {
        if (testo == null || testo.length > TESTO_MASSIMO) return null
        val parti = testo.split(':', limit = 5)
        if (parti.size != 5) return null
        val (prefisso, versione, id, chiave, nomeCodificato) = parti
        if (prefisso != PREFISSO || versione != VERSIONE) return null
        if (!idValido(id) || !chiaveValida(chiave)) return null
        val nome = decodificaNome(nomeCodificato) ?: return null
        return CodiceCollega(id, chiave, nome)
    }

    /** 22 caratteri base64url che sono esattamente 16 byte. */
    fun idValido(id: String): Boolean = base64urlCanonico(id, LUNGHEZZA_ID, 16) != null

    /** 44 caratteri base64url: 33 byte, `02` o `03` davanti, e la X di un punto della curva P-256. */
    fun chiaveValida(chiave: String): Boolean {
        val b = base64urlCanonico(chiave, LUNGHEZZA_CHIAVE, 33) ?: return false
        if (b[0] != 0x02.toByte() && b[0] != 0x03.toByte()) return false
        return P256.suCurva(BigInteger(1, b.copyOfRange(1, 33)))
    }

    /**
     * Il nome scritto con encodeURIComponent, decodificato (UTF-8). Null se non è
     * codificato come lo codifica il computer (un `:` o uno spazio scritti così
     * come sono, un `%` senza due cifre esadecimali, UTF-8 rotto), se è vuoto o
     * più lungo di 32 caratteri, o se ha caratteri di controllo o invisibili.
     */
    fun decodificaNome(codificato: String): String? {
        if (codificato.isEmpty()) return null
        val byte = java.io.ByteArrayOutputStream()
        var i = 0
        while (i < codificato.length) {
            val ch = codificato[i]
            when {
                ch == '%' -> {
                    if (i + 2 >= codificato.length) return null
                    val alto = Character.digit(codificato[i + 1], 16)
                    val basso = Character.digit(codificato[i + 2], 16)
                    if (alto < 0 || basso < 0) return null
                    byte.write(alto * 16 + basso)
                    i += 3
                }
                ch in NON_CODIFICATI -> { byte.write(ch.code); i++ }
                else -> return null
            }
        }
        val nome = try {
            Charsets.UTF_8.newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT)
                .decode(ByteBuffer.wrap(byte.toByteArray())).toString()
        } catch (_: CharacterCodingException) {
            return null
        }
        // La lunghezza come la conta il computer (JavaScript) e il server: in unità UTF-16.
        if (nome.isBlank() || nome.length > NOME_MASSIMO) return null
        if (nome.any { visibileMale(it) }) return null
        return nome
    }

    /** Controllo (a capo, tabulazione), formato (inversione del verso, spazi di larghezza zero), separatori di riga. */
    private fun visibileMale(ch: Char): Boolean {
        val tipo = Character.getType(ch)
        return Character.isISOControl(ch) ||
            tipo == Character.FORMAT.toInt() ||
            tipo == Character.LINE_SEPARATOR.toInt() ||
            tipo == Character.PARAGRAPH_SEPARATOR.toInt() ||
            tipo == Character.PRIVATE_USE.toInt() ||
            tipo == Character.UNASSIGNED.toInt()
    }

    /** I byte di [testo] se è base64url senza `=`, lungo [caratteri], di [byte] byte e scritto come lo riscriverebbe il computer. */
    private fun base64urlCanonico(testo: String, caratteri: Int, byte: Int): ByteArray? {
        if (testo.length != caratteri || !BASE64URL.matches(testo)) return null
        val b = try {
            Base64.getUrlDecoder().decode(testo)
        } catch (_: IllegalArgumentException) {
            return null
        }
        if (b.size != byte) return null
        // Lo stesso numero si può scrivere con l'ultima lettera diversa (i bit avanzati): vale solo la forma del computer.
        if (Base64.getUrlEncoder().withoutPadding().encodeToString(b) != testo) return null
        return b
    }

    /** La curva P-256 (prime256v1, secp256r1): y² = x³ − 3x + b modulo p. */
    private object P256 {
        val p = BigInteger("ffffffff00000001000000000000000000000000ffffffffffffffffffffffff", 16)
        val b = BigInteger("5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604b", 16)
        private val esponente = p.add(BigInteger.ONE).shiftRight(2)

        /** C'è un punto della curva con questa X (p ≡ 3 mod 4: la radice quadrata è un elevamento a potenza). */
        fun suCurva(x: BigInteger): Boolean {
            if (x.signum() < 0 || x >= p) return false
            val destra = x.modPow(BigInteger.valueOf(3), p).subtract(x.multiply(BigInteger.valueOf(3))).add(b).mod(p)
            val y = destra.modPow(esponente, p)
            return y.multiply(y).mod(p) == destra
        }
    }
}

/**
 * Il lettore dei QR (ZXing core, solo QR): dalla luminanza di un'immagine (un
 * byte per pixel, riga dopo riga, come il piano Y della fotocamera) al testo.
 * Lo usa la fotocamera di Collega un computer e lo provano i campioni del
 * computer (pc/prove/qr-campioni.json). Un lettore per filo: non è condivisibile.
 */
class LettoreQrZxing {
    private val lettore = com.google.zxing.MultiFormatReader().apply {
        setHints(mapOf(com.google.zxing.DecodeHintType.POSSIBLE_FORMATS to listOf(com.google.zxing.BarcodeFormat.QR_CODE)))
    }

    /** Il testo del QR nell'immagine, o null se non ce n'è uno leggibile. */
    fun leggi(luminanza: ByteArray, larghezza: Int, altezza: Int): String? = try {
        val sorgente = com.google.zxing.PlanarYUVLuminanceSource(luminanza, larghezza, altezza, 0, 0, larghezza, altezza, false)
        lettore.decodeWithState(com.google.zxing.BinaryBitmap(com.google.zxing.common.HybridBinarizer(sorgente))).text
    } catch (_: com.google.zxing.ReaderException) {
        null
    } finally {
        lettore.reset()
    }
}

/** Quello che dice statoComputer (§4): il telefono aspetta che il computer entri. */
data class StatoComputer(val stato: String, val nome: String = "") {
    companion object {
        const val AUTORIZZATO = "autorizzato"
        const val ENTRATO = "entrato"
        const val SCADUTO = "scaduto"

        /** Non è del server: la domanda non è arrivata (la rete). Si richiede al giro dopo. */
        const val RETE = "rete"
    }
}

/**
 * L'attesa dopo Collega (§7): statoComputer ogni 1,5 secondi; "entrato" chiude
 * con la spunta, e dopo 30 secondi senza (o con l'autorizzazione scaduta) si dice
 * "Il computer non ha risposto". La rete che manca per un giro non ferma niente.
 */
object AttesaComputer {
    const val OGNI_MS = 1_500L
    const val MASSIMO_MS = 30_000L

    enum class Esito { ASPETTA, ENTRATO, NON_RISPOSTO }

    fun decidi(stato: String, trascorsiMs: Long): Esito = when {
        stato == StatoComputer.ENTRATO -> Esito.ENTRATO
        stato == StatoComputer.SCADUTO -> Esito.NON_RISPOSTO
        trascorsiMs >= MASSIMO_MS -> Esito.NON_RISPOSTO
        else -> Esito.ASPETTA
    }
}
