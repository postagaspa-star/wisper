package eu.stgm.wisper.rapportino

import kotlinx.coroutines.runBlocking
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.io.File
import java.math.BigInteger
import java.security.AlgorithmParameters
import java.security.KeyFactory
import java.security.KeyPair
import java.security.KeyPairGenerator
import java.security.SecureRandom
import java.security.interfaces.ECPrivateKey
import java.security.interfaces.ECPublicKey
import java.security.spec.ECGenParameterSpec
import java.security.spec.ECParameterSpec
import java.security.spec.ECPoint
import java.security.spec.ECPrivateKeySpec
import java.security.spec.ECPublicKeySpec
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.KeyAgreement
import javax.crypto.Mac
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * Collegare il computer col QR contro il server di prova vero (docs/gestionale/collega-qr.md §4, §5):
 * il telefono autorizza con autorizzaComputer e aspetta con statoComputer, passando dalle strade di
 * sempre (casa, o Google col finto Google); qui la prova fa anche la parte del computer (attesaComputer
 * senza token, da casa, e il pacchetto decifrato con la sua chiave privata), per vedere il giro intero:
 * il token che arriva al computer vale davvero, ed è di chi ha inquadrato.
 *
 * Si lanciano in un modo solo, come le altre prove col server (ServerDiProva.kt):
 *
 *     node server/prove/telefono.js            (--giri 2: due giri di fila sullo stesso server)
 *
 * Senza WISPER_SERVER_PROVA le prove col server si saltano. Quella del caso condiviso
 * (server/prove/casi-collega.json) gira sempre: controlla che la decifratura di queste prove
 * sia quella dell'accordo, la stessa di Node e di C#.
 */
class ServerDiProvaCollegaTest {
    private val casa = ServerDiProva.indirizzo
    private val google = ServerDiProva.google
    private val b64 = Base64.getUrlEncoder().withoutPadding()
    private val d64 = Base64.getUrlDecoder()
    private val chi = mapOf("disp" to "prova-collega", "dispNome" to "prove del collegamento col QR", "app" to "telefono prove")

    private fun ponte(token: String, casa: String = this.casa, google: String = "") = PonteServer({ casa }, { token }, { chi }, google = { google })
    private fun entra(email: String): String = runBlocking { ponte("").accedi(email, "prova").token }

    // ------------------------------------------------------------- la parte del computer, per la prova

    private val curva: ECParameterSpec by lazy {
        AlgorithmParameters.getInstance("EC").apply { init(ECGenParameterSpec("secp256r1")) }.getParameterSpec(ECParameterSpec::class.java)
    }

    private fun coppia(): KeyPair = KeyPairGenerator.getInstance("EC").apply { initialize(ECGenParameterSpec("secp256r1")) }.generateKeyPair()

    private fun a32(n: BigInteger): ByteArray = n.toByteArray().let { if (it.size > 32) it.copyOfRange(it.size - 32, it.size) else ByteArray(32 - it.size) + it }

    /** La chiave pubblica compressa come la mette il computer nel QR. */
    private fun compressa(k: ECPublicKey): String =
        b64.encodeToString(byteArrayOf(if (k.w.affineY.testBit(0)) 3 else 2) + a32(k.w.affineX))

    private fun idACaso(): String = b64.encodeToString(ByteArray(16).also(SecureRandom()::nextBytes))

    /** §5: ECDH P-256 (la X), HKDF-SHA256 (sale = id, info = "wisper-collega-1"), AES-256-GCM con AAD = id e tag in coda. */
    private fun decifra(privata: ECPrivateKey, id: ByteArray, r: JSONObject): String {
        val pub = d64.decode(r.getString("chiave"))
        assertEquals("la chiave del server non compressa: 65 byte", 65, pub.size)
        assertEquals(4, pub[0].toInt())
        val server = KeyFactory.getInstance("EC").generatePublic(
            ECPublicKeySpec(ECPoint(BigInteger(1, pub.copyOfRange(1, 33)), BigInteger(1, pub.copyOfRange(33, 65))), curva),
        )
        val segreto = KeyAgreement.getInstance("ECDH").apply { init(privata); doPhase(server, true) }.generateSecret()
        val hmac = { chiave: ByteArray, dati: ByteArray -> Mac.getInstance("HmacSHA256").apply { init(SecretKeySpec(chiave, "HmacSHA256")) }.doFinal(dati) }
        val prk = hmac(id, segreto)
        val aes = hmac(prk, "wisper-collega-1".toByteArray() + byteArrayOf(1))
        val iv = d64.decode(r.getString("iv"))
        assertEquals(12, iv.size)
        val c = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.DECRYPT_MODE, SecretKeySpec(aes, "AES"), GCMParameterSpec(128, iv)); updateAAD(id) }
        return String(c.doFinal(d64.decode(r.getString("dati"))), Charsets.UTF_8)
    }

    /** attesaComputer come la chiede il computer: senza token, dalla rete di casa. */
    private fun attesa(id: String): JSONObject {
        val corpo = JSONObject().put("azione", "attesaComputer").put("id", id).put("disp", "prova-computer-qr").toString()
        val r = Request.Builder().url(Strade.base(casa) + "/exec").post(corpo.toRequestBody("text/plain;charset=utf-8".toMediaType())).build()
        return OkHttpClient().newCall(r).execute().use { JSONObject(it.body!!.string()) }
    }

    // ------------------------------------------------------------- le prove

    @Test
    fun `il caso condiviso col server e col computer si decifra anche qui`() {
        val f = listOf("../server/prove/casi-collega.json", "server/prove/casi-collega.json").map(::File).firstOrNull { it.exists() }
        assumeTrue("Manca server/prove/casi-collega.json", f != null)
        val casi = JSONObject(f!!.readText(Charsets.UTF_8)).getJSONArray("casi")
        for (i in 0 until casi.length()) {
            val k = casi.getJSONObject(i)
            // La chiave del QR del caso passa la lettura del telefono.
            assertTrue(k.getString("nome"), CollegaQr.chiaveValida(k.getString("chiaveQr")))
            val privata = KeyFactory.getInstance("EC").generatePrivate(ECPrivateKeySpec(BigInteger(1, d64.decode(k.getString("privataComputer"))), curva)) as ECPrivateKey
            assertEquals(k.getString("nome"), k.getString("inChiaro"), decifra(privata, d64.decode(k.getString("id")), k.getJSONObject("risultato")))
        }
    }

    @Test
    fun `il telefono autorizza, il computer entra col token di chi ha inquadrato, il telefono lo vede entrato`() = runBlocking {
        assumeTrue("Server di prova spento: prova saltata", casa.isNotBlank())
        val token = entra("manuel@esempio.it")
        val telefono = ponte(token)
        val chiavi = coppia()
        val id = idACaso()
        val codice = CollegaQr.leggi("wisper-collega:1:$id:${compressa(chiavi.public as ECPublicKey)}:UFFICIO-PC")
        assertNotNull("il testo del QR di prova passa la lettura del telefono", codice)
        assertEquals("UFFICIO-PC", telefono.autorizzaComputer(codice!!))
        assertEquals(StatoComputer(StatoComputer.AUTORIZZATO, "UFFICIO-PC"), telefono.statoComputer(id))
        // Lo stesso codice una seconda volta (una foto del QR, un doppio tocco): no, con la frase dell'accordo.
        try {
            telefono.autorizzaComputer(codice)
            fail("un id già usato non si autorizza due volte")
        } catch (e: PonteServer.Rifiutato) {
            assertEquals("Questo codice è già stato usato: sul computer ne compare uno nuovo", e.message)
        }
        // Il computer, da casa e senza token: una volta "pronto" col pacchetto, poi solo "attesa".
        val pronto = attesa(id)
        assertEquals(pronto.toString(), "pronto", pronto.optString("stato"))
        val pacchetto = JSONObject(decifra(chiavi.private as ECPrivateKey, d64.decode(id), pronto))
        assertEquals("Manuel Gasparotto", pacchetto.getJSONObject("utente").getString("nome"))
        assertEquals("attesa", attesa(id).optString("stato"))
        // Il token del computer vale: è Manuel, con i suoi permessi.
        val computer = ponte(pacchetto.getString("token"))
        assertEquals("Manuel Gasparotto", computer.io().utente.nome)
        // Il telefono adesso lo vede entrato (è quello che fa dire "UFFICIO-PC è entrato").
        val s = telefono.statoComputer(id)
        assertEquals(StatoComputer(StatoComputer.ENTRATO, "UFFICIO-PC"), s)
        assertEquals(AttesaComputer.Esito.ENTRATO, AttesaComputer.decidi(s.stato, 3_000))
        // Un altro utente non vede i computer collegati da Manuel: per lui l'id non esiste.
        assertEquals(StatoComputer.SCADUTO, ponte(entra("laura@esempio.it")).statoComputer(id).stato)
        // Un id mai visto: scaduto, cioè "Il computer non ha risposto".
        assertEquals(StatoComputer.SCADUTO, telefono.statoComputer(idACaso()).stato)
        computer.esci()
        telefono.esci()
    }

    @Test
    fun `lo stesso QR ripetuto con lo stesso id di richiesta ridà la risposta di prima, non già usato`() = runBlocking {
        assumeTrue("Server di prova spento: prova saltata", casa.isNotBlank())
        val telefono = ponte(entra("manuel@esempio.it"))
        val id = idACaso()
        val codice = CodiceCollega(id, compressa(coppia().public as ECPublicKey), "UFFICIO-PC")
        // Come Archivio.autorizzaComputer: la risposta persa e il Riprova sullo stesso codice usano lo stesso id.
        val prima = IdRichiesta.perOperazione("collega-qr-$id") { telefono.autorizzaComputer(codice) }
        val ripetuta = IdRichiesta.perOperazione("collega-qr-$id") { telefono.autorizzaComputer(codice) }
        assertEquals("UFFICIO-PC", prima)
        assertEquals("UFFICIO-PC", ripetuta)
        assertEquals(StatoComputer.AUTORIZZATO, telefono.statoComputer(id).stato)
        // Senza lo stesso id è un'altra richiesta: già usato.
        try {
            telefono.autorizzaComputer(codice)
            fail("un id già usato non si autorizza due volte")
        } catch (e: PonteServer.Rifiutato) {
            assertTrue(e.message.orEmpty().startsWith("Questo codice è già stato usato"))
        }
        telefono.esci()
    }

    @Test
    fun `Collega toccato 7 secondi dopo l'ultima richiesta arriva lo stesso`() = runBlocking {
        assumeTrue("Server di prova spento: prova saltata", casa.isNotBlank())
        // Il server chiude le connessioni ferme da 5 s, OkHttp le controllava solo dopo 10: in mezzo la
        // scrittura (che non si ripete da sola) cadeva. È proprio il tempo fra l'apertura della fotocamera e Collega.
        val telefono = ponte(entra("manuel@esempio.it"))
        telefono.io()
        Thread.sleep(7_000)
        val id = idACaso()
        assertEquals("UFFICIO-PC", telefono.autorizzaComputer(CodiceCollega(id, compressa(coppia().public as ECPublicKey), "UFFICIO-PC")))
        telefono.esci()
    }

    @Test
    fun `un codice che il server non accetta torna con la sua frase`() = runBlocking {
        assumeTrue("Server di prova spento: prova saltata", casa.isNotBlank())
        val telefono = ponte(entra("laura@esempio.it"))
        // La X di una chiave vera col primo byte 04: il telefono la rifiuta prima, e anche il server.
        val k = (coppia().public as ECPublicKey)
        val sbagliata = b64.encodeToString(byteArrayOf(4) + a32(k.w.affineX))
        try {
            telefono.autorizzaComputer(CodiceCollega(idACaso(), sbagliata, "UFFICIO-PC"))
            fail("una chiave non compressa non si autorizza")
        } catch (e: PonteServer.Rifiutato) {
            assertEquals(CollegaQr.NON_E_WISPER, e.message)
        }
        telefono.esci()
    }

    @Test
    fun `fuori casa il telefono autorizza passando da Google`() = runBlocking {
        assumeTrue("Finto Google o server di prova spenti: prova saltata", casa.isNotBlank() && google.isNotBlank())
        val lontana = "http://127.0.0.1:9"
        val token = runBlocking { ponte("", lontana, google).accedi("marco@esempio.it", "prova").token }
        val fuori = ponte(token, lontana, google)
        val chiavi = coppia()
        val id = idACaso()
        val codice = CodiceCollega(id, compressa(chiavi.public as ECPublicKey), "PC di Marco")
        assertEquals("PC di Marco", fuori.autorizzaComputer(codice))
        assertEquals(Strade.Dove.GOOGLE, fuori.strade.dove.value)
        assertEquals(StatoComputer.AUTORIZZATO, fuori.statoComputer(id).stato)
        // Il computer invece è in ufficio: entra da casa, e il telefono fuori lo vede entrato attraverso Google.
        val pronto = attesa(id)
        assertEquals("pronto", pronto.optString("stato"))
        assertEquals("Marco Rossato", JSONObject(decifra(chiavi.private as ECPrivateKey, d64.decode(id), pronto)).getJSONObject("utente").getString("nome"))
        assertEquals(StatoComputer.ENTRATO, fuori.statoComputer(id).stato)
        fuori.esci()
    }
}
