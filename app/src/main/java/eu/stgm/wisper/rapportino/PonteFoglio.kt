package eu.stgm.wisper.rapportino

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.time.LocalDate
import java.time.LocalDateTime
import java.util.Base64
import java.util.concurrent.TimeUnit

/**
 * Il collegamento col foglio Google, attraverso lo script pubblicato come app
 * web (apps-script/Code.gs).
 *
 * Perche' non le API di Google Fogli: richiederebbero credenziali dentro l'app
 * e un giro di autorizzazioni. Lo script invece e' un indirizzo solo, protetto
 * da un codice, e i conti si fanno li'.
 *
 * ATTENZIONE AL REINDIRIZZAMENTO. Apps Script risponde con un rimbalzo verso un
 * secondo indirizzo, e la risposta vera arriva da li'. Il comportamento
 * predefinito di OkHttp e' quello giusto e non va toccato: forzare il metodo a
 * restare POST rompe tutto con un errore 411. Verificato il 07/08.
 *
 * Due tipi di errore, e la differenza conta per la coda:
 *  - [RifiutatoDalFoglio]: lo script ha risposto e ha detto di no ("codice
 *    sbagliato", "rapportino gia' firmato"). Riprovare uguale non serve.
 *  - qualunque altra eccezione: la rete o Google. Si riprova.
 *
 * Le scritture non si ripetono mai da sole (vedi [clientScrittura]): un'email
 * ripetuta sono due email.
 */
class PonteFoglio(
    private val url: () -> String,
    private val codice: () -> String,
    /** Chi chiama (disp, dispNome, app): lo script lo scrive nel registro degli accessi. */
    private val chiSono: () -> Map<String, String> = { emptyMap() },
    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build(),
) {

    val configurato: Boolean get() = url().isNotBlank() && codice().isNotBlank()

    class RifiutatoDalFoglio(messaggio: String) : Exception(messaggio)

    suspend fun anagrafiche(): Anagrafiche = withContext(Dispatchers.IO) {
        Anagrafiche.daJson(leggi("anagrafiche"))
    }

    /** I rapportini fra due date comprese, i piu' recenti prima. */
    suspend fun rapportini(da: LocalDate, a: LocalDate): List<Rapportino> = withContext(Dispatchers.IO) {
        leggi("rapportini", "da" to da.format(Rapportino.ISO), "a" to a.format(Rapportino.ISO))
            .optJSONArray("rapportini").oggetti()
            .map { Rapportino.daJson(it, dalFoglio = true) }
    }

    /**
     * Tutti i rapportini del foglio, senza limiti di data (gli annullati no), come
     * li legge il computer: servono al cruscotto delle commesse e a "restano da
     * fatturare dei mesi prima". Dopo qualche anno la risposta e' grande: si
     * aspetta di piu'.
     */
    suspend fun rapportiniTutti(): List<Rapportino> = withContext(Dispatchers.IO) {
        leggi("rapportini", c = clientLetturaLunga)
            .optJSONArray("rapportini").oggetti()
            .map { Rapportino.daJson(it, dalFoglio = true) }
    }

    /** Crea o aggiorna la riga. Torna il rapportino come l'ha scritto il foglio, conti compresi. */
    suspend fun salva(r: Rapportino): Rapportino = withContext(Dispatchers.IO) {
        val risposta = scrivi(JSONObject().put("azione", "salvaRapportino").put("rapportino", r.perIlFoglio()))
        Rapportino.daJson(
            risposta.optJSONObject("rapportino") ?: throw RifiutatoDalFoglio("il foglio non ha restituito il rapportino"),
            dalFoglio = true,
        )
    }

    /**
     * Carica una foto di spesa o una firma. [idFile] e' lo stesso a ogni
     * tentativo: se il file e' gia' arrivato, lo script non ne crea un secondo.
     */
    suspend fun caricaFile(
        tipo: String,
        idLocale: String,
        id: String,
        idFile: String,
        file: File,
        mime: String,
        firmatario: String = "",
        firmatoIl: String = "",
    ): FileRemoto = withContext(Dispatchers.IO) {
        caricaFile(tipo, file.readBytes(), mime, idLocale, id, idFile, firmatario, firmatoIl)
    }

    /**
     * Carica un file qualunque, dai byte. [tipo] come in caricaFile() dello script:
     *  - "spesa" e "firma": del rapportino [idLocale] / [id]. Per la firma anche
     *    [firmatario] e [firmatoIl]; vale come firma anche la foto del foglio
     *    firmato a mano;
     *  - "firmaTecnico": la firma del compilatore, che lo script scrive in FIRMA_TECNICO;
     *  - "documento": un documento della commessa [idCommessa], col suo [nome].
     */
    suspend fun caricaFile(
        tipo: String,
        dati: ByteArray,
        mime: String,
        idLocale: String = "",
        id: String = "",
        idFile: String = "",
        firmatario: String = "",
        firmatoIl: String = "",
        idCommessa: String = "",
        nome: String = "",
    ): FileRemoto = withContext(Dispatchers.IO) {
        if (dati.isEmpty()) throw RifiutatoDalFoglio("Il file è vuoto")
        val corpo = JSONObject()
            .put("azione", "caricaFile")
            .put("tipo", tipo)
            .put("idLocale", idLocale)
            .put("id", id)
            .put("idFile", idFile)
            .put("mime", mime)
            .put("base64", Base64.getEncoder().encodeToString(dati))
            .put("firmatario", firmatario)
            .put("firmatoIl", firmatoIl)
        if (idCommessa.isNotBlank()) corpo.put("idCommessa", idCommessa)
        if (nome.isNotBlank()) corpo.put("nome", nome)
        val f = scrivi(corpo).optJSONObject("file") ?: throw RifiutatoDalFoglio("il foglio non ha salvato il file")
        FileRemoto.daJson(f)
    }

    /** @param chiave il numero RAP/... se il foglio l'ha gia' dato, altrimenti l'idLocale. */
    suspend fun togliFile(chiave: String, fileId: String): Rapportino = withContext(Dispatchers.IO) {
        val r = scrivi(JSONObject().put("azione", "togliFile").put("id", chiave).put("fileId", fileId))
        Rapportino.daJson(r.getJSONObject("rapportino"), dalFoglio = true)
    }

    /**
     * BOZZA (riporta in bozza: la firma cade), INVIATO, FATTURATO, ANNULLATO.
     * @param chiave il numero RAP/... se il foglio l'ha gia' dato, altrimenti l'idLocale.
     */
    suspend fun stato(chiave: String, stato: Stato): Rapportino =
        stato(listOf(chiave), stato).firstOrNull() ?: throw RifiutatoDalFoglio("il foglio non ha restituito il rapportino")

    /**
     * Lo stesso per tanti rapportini insieme (il riepilogo di luglio si segna
     * fatturato in una volta). Torna i rapportini come li ha scritti il foglio.
     * Le regole su cosa si puo' segnare (un fatturato non torna inviato) le tiene
     * chi chiama: lo script fa quello che gli si chiede.
     */
    suspend fun stato(chiavi: List<String>, stato: Stato): List<Rapportino> = withContext(Dispatchers.IO) {
        scrivi(JSONObject().put("azione", "stato").put("ids", JSONArray(chiavi)).put("stato", stato.name))
            .optJSONArray("rapportini").oggetti()
            .map { Rapportino.daJson(it, dalFoglio = true) }
    }

    // ------------------------------------------------------------- anagrafiche

    /**
     * Un cliente nuovo. Se c'e' gia' (anche solo come altro nome) lo script non
     * ne fa un doppione: torna quello che c'era, con giaEsisteva. Lo script scrive
     * solo l'anagrafica: viaggio, km e tariffe vanno poi con [aggiornaCliente].
     */
    suspend fun creaCliente(c: Cliente): Salvataggio<Cliente> = withContext(Dispatchers.IO) {
        val r = scrivi(
            JSONObject().put("azione", "creaCliente")
                .put("nome", c.nome.trim()).put("email", c.email.trim()).put("telefono", c.telefono.trim())
                .put("indirizzo", c.indirizzo.trim()).put("partitaIva", c.partitaIva.trim()).put("note", c.note.trim())
                .put("tariffaFissa", c.tariffaFissa ?: JSONObject.NULL)
        )
        val o = r.optJSONObject("cliente") ?: throw RifiutatoDalFoglio("il foglio non ha restituito il cliente")
        Salvataggio(Cliente.daJson(o), o.optBoolean("giaEsisteva", false))
    }

    /** Riscrive tutta la scheda del cliente [Cliente.id]. Un campo null torna vuoto (= come di solito). */
    suspend fun aggiornaCliente(c: Cliente): Cliente = withContext(Dispatchers.IO) {
        val campi = JSONObject()
            .put("nome", c.nome.trim()).put("email", c.email.trim()).put("telefono", c.telefono.trim())
            .put("indirizzo", c.indirizzo.trim()).put("partitaIva", c.partitaIva.trim()).put("note", c.note.trim())
            .put("alias", JSONArray(c.alias.map { it.trim() }.filter { it.isNotBlank() }))
            .put("pagaViaggio", c.pagaViaggio ?: JSONObject.NULL)
            .put("kmRimborsati", c.kmRimborsati ?: JSONObject.NULL)
            .put("tariffaFissa", c.tariffaFissa ?: JSONObject.NULL)
            .put("costoFisso", c.costoFisso ?: JSONObject.NULL)
            .put("ultimaTariffa", c.ultimaTariffa ?: JSONObject.NULL)
            .put("maggExtra", c.maggExtra ?: JSONObject.NULL)
        val r = scrivi(JSONObject().put("azione", "aggiornaCliente").put("id", c.id).put("campi", campi))
        Cliente.daJson(r.optJSONObject("cliente") ?: throw RifiutatoDalFoglio("il foglio non ha restituito il cliente"))
    }

    /**
     * Una commessa nuova. Con [Commessa.id] vuoto il codice lo sceglie lo script
     * (il primo libero); un codice scritto che e' gia' di un'altra commessa il
     * foglio lo rifiuta. Se lo stesso cliente ha gia' una commessa con lo stesso
     * nome torna quella, con giaEsisteva.
     *
     * @param cliente il suo cliente: se ha la tariffa fissa o il costo fisso
     *        (Elettrodinamica), prezzo e costo restano sulla sua scheda e non si
     *        copiano sulla commessa, come fa il computer.
     */
    suspend fun creaCommessa(m: Commessa, cliente: Cliente? = null): Salvataggio<Commessa> = withContext(Dispatchers.IO) {
        val corpo = campiCommessa(m, cliente, nuova = true).put("azione", "creaCommessa").put("id", m.id.trim().uppercase())
        val o = scrivi(corpo).optJSONObject("commessa") ?: throw RifiutatoDalFoglio("il foglio non ha restituito la commessa")
        Salvataggio(Commessa.daJson(o), o.optBoolean("giaEsisteva", false))
    }

    /** Riscrive la commessa [Commessa.id], stato compreso (APERTA, SOSPESA, CHIUSA). */
    suspend fun aggiornaCommessa(m: Commessa, cliente: Cliente? = null): Commessa = withContext(Dispatchers.IO) {
        val r = scrivi(
            JSONObject().put("azione", "aggiornaCommessa").put("id", m.id.trim())
                .put("campi", campiCommessa(m, cliente, nuova = false))
        )
        Commessa.daJson(r.optJSONObject("commessa") ?: throw RifiutatoDalFoglio("il foglio non ha restituito la commessa"))
    }

    private fun campiCommessa(m: Commessa, cliente: Cliente?, nuova: Boolean): JSONObject {
        val o = JSONObject()
            .put("idCliente", m.idCliente)
            .put("descrizione", m.descrizione.trim())
            .put("indirizzo", m.indirizzo.trim())
            .put("inizio", m.inizio?.format(Rapportino.ISO) ?: "")
            .put("finePrevista", m.finePrevista?.format(Rapportino.ISO) ?: "")
            .put("budgetOre", m.budgetOre ?: JSONObject.NULL)
            .put("budgetEuro", m.budgetEuro ?: JSONObject.NULL)
            .put("euroKm", m.euroKm ?: JSONObject.NULL)
            .put("note", m.note.trim())
        if (cliente?.tariffaFissa == null) o.put("prezzoOrario", m.prezzoOrario ?: JSONObject.NULL)
        if (cliente?.costoFisso == null) o.put("costoOrario", m.costoOrario ?: JSONObject.NULL)
        // Una commessa nuova nasce sempre APERTA: lo decide lo script.
        if (!nuova) o.put("stato", m.stato.trim().uppercase().ifBlank { "APERTA" })
        return o
    }

    /**
     * Scrive le impostazioni date (le altre restano). I valori sono testo o
     * numero: EURO_KM e COSTO_ORARIO vanno come numero, come li manda il computer.
     * Torna tutte le impostazioni come sono ora sul foglio.
     */
    suspend fun salvaImpostazioni(valori: Map<String, Any?>): Map<String, String> = withContext(Dispatchers.IO) {
        val v = JSONObject()
        valori.forEach { (k, x) -> v.put(k, x ?: "") }
        val r = scrivi(JSONObject().put("azione", "salvaImpostazioni").put("valori", v))
        Anagrafiche.impostazioniDaJson(r.optJSONObject("impostazioni"))
    }

    // ------------------------------------------------------------- file e documenti

    /** I documenti della cartella della commessa, piu' recenti prima. Se la cartella manca, lo script la crea. */
    suspend fun documenti(idCommessa: String): DocumentiCommessa = withContext(Dispatchers.IO) {
        val r = leggi("documenti", "idCommessa" to idCommessa)
        DocumentiCommessa(
            cartella = r.testo("cartella"),
            documenti = r.optJSONArray("documenti").oggetti().map { d ->
                Documento(
                    id = d.testo("id"),
                    nome = d.testo("nome"),
                    url = d.testo("url"),
                    mime = d.testo("mime"),
                    data = d.testo("data").takeIf { it.isNotBlank() }?.let { runCatching { LocalDateTime.parse(it) }.getOrNull() },
                )
            },
        )
    }

    /**
     * Il contenuto di un file della cartella Wisper (firme, scontrini, la firma
     * del compilatore), per metterlo nei PDF. Torna i byte e il tipo.
     */
    suspend fun file(id: String): Pair<ByteArray, String> = withContext(Dispatchers.IO) {
        val f = leggi("file", "id" to id, c = clientLetturaLunga).optJSONObject("file")
            ?: throw RifiutatoDalFoglio("il foglio non ha restituito il file")
        val dati = try {
            Base64.getMimeDecoder().decode(f.testo("base64"))
        } catch (_: IllegalArgumentException) {
            throw RifiutatoDalFoglio("il file arrivato dal foglio non si legge")
        }
        dati to f.testo("mime").ifBlank { "application/octet-stream" }
    }

    // ------------------------------------------------------------- email

    /**
     * Manda l'email dall'account di chi possiede il foglio, coi PDF allegati, e
     * segna inviati i rapportini [chiavi] (non i fatturati: lo script li salta).
     * Con [aMe] la manda solo al proprietario, come prova, e non segna niente.
     * Torna i rapportini cambiati.
     *
     * MAI ripetuta da sola: se la risposta non arriva l'email puo' essere partita
     * lo stesso. Decide chi usa l'app, dopo aver guardato la posta inviata.
     */
    suspend fun inviaEmail(
        a: String,
        cc: String,
        oggetto: String,
        messaggio: String,
        allegati: List<Allegato>,
        chiavi: List<String>,
        aMe: Boolean = false,
    ): List<Rapportino> = withContext(Dispatchers.IO) {
        val corpo = JSONObject()
            .put("azione", "inviaEmail")
            .put("a", a.trim()).put("cc", cc.trim())
            .put("oggetto", oggetto).put("messaggio", messaggio)
            .put("allegati", JSONArray().apply {
                allegati.forEach {
                    put(JSONObject().put("nome", it.nome).put("mime", it.mime).put("base64", Base64.getEncoder().encodeToString(it.dati)))
                }
            })
            .put("ids", JSONArray(chiavi))
            .put("aMe", aMe)
        scrivi(corpo).optJSONArray("rapportini").oggetti().map { Rapportino.daJson(it, dalFoglio = true) }
    }

    /**
     * Fa mandare al proprietario del foglio un'email col file che collega Wisper
     * Ufficio (lo apre sul computer e si collega da solo). Torna a chi e' andata.
     */
    suspend fun collegaComputer(): String = withContext(Dispatchers.IO) {
        scrivi(JSONObject().put("azione", "collegaComputer").put("url", url())).optString("a")
    }

    // --- interno ---

    private fun leggi(azione: String, vararg parametri: Pair<String, String>, c: OkHttpClient = client): JSONObject {
        controllaConfigurazione()
        val indirizzo = url().toHttpUrlOrNull()?.newBuilder()
            ?.addQueryParameter("codice", codice())
            ?.addQueryParameter("azione", azione)
            ?.apply { chiSono().forEach { (k, v) -> addQueryParameter(k, v) } }
            ?.apply { parametri.forEach { (k, v) -> addQueryParameter(k, v) } }
            ?.build()
            ?: throw RifiutatoDalFoglio("indirizzo del foglio non valido")
        return chiama(Request.Builder().url(indirizzo).get().build(), c)
    }

    private fun scrivi(corpo: JSONObject): JSONObject {
        controllaConfigurazione()
        corpo.put("codice", codice())
        chiSono().forEach { (k, v) -> corpo.put(k, v) }
        return chiama(
            Request.Builder()
                .url(url())
                // text/plain di proposito: evita il preflight e Apps Script legge
                // comunque il corpo grezzo con postData.contents.
                .post(corpo.toString().toRequestBody("text/plain;charset=utf-8".toMediaType()))
                .build(),
            clientScrittura,
        )
    }

    /**
     * Per le scritture si aspetta di piu'. Lo script ci ha messo diciotto
     * secondi il 26/09, e rinunciare troppo presto vuol dire ritentare una riga
     * che forse e' gia' stata scritta (non e' un dramma, grazie a idLocale, ma
     * e' tempo perso).
     *
     * E una scrittura non si ripete MAI da sola, neanche quando OkHttp crede che
     * la connessione sia caduta prima della risposta: l'email riprovata sono due
     * email, il documento ricaricato due documenti. Riprova la coda (che lo sa
     * fare senza doppioni) o chi usa l'app.
     */
    private val clientScrittura: OkHttpClient by lazy {
        client.newBuilder().readTimeout(90, TimeUnit.SECONDS).writeTimeout(60, TimeUnit.SECONDS)
            .retryOnConnectionFailure(false)
            .build()
    }

    /** Tutti i rapportini, o un file: risposte grandi, si aspetta come per le scritture. */
    private val clientLetturaLunga: OkHttpClient by lazy {
        client.newBuilder().readTimeout(90, TimeUnit.SECONDS).build()
    }

    private fun controllaConfigurazione() {
        if (!configurato) throw RifiutatoDalFoglio("Indirizzo o codice del foglio mancanti: vedi Impostazioni")
    }

    private fun chiama(richiesta: Request, c: OkHttpClient): JSONObject {
        c.newCall(richiesta).execute().use { r ->
            val testo = r.body?.string().orEmpty()
            if (!r.isSuccessful) throw java.io.IOException("HTTP ${r.code}")
            val json = try {
                JSONObject(testo)
            } catch (_: Exception) {
                // Succede quando lo script non e' pubblicato come "Chiunque":
                // Google risponde con una pagina di accesso invece del JSON.
                throw RifiutatoDalFoglio("Risposta non valida dal foglio (lo script e' pubblicato per \"Chiunque\"?)")
            }
            if (!json.optBoolean("ok")) {
                throw RifiutatoDalFoglio(json.optString("errore").ifBlank { "errore sconosciuto" })
            }
            return json
        }
    }
}

/** Il risultato di una creazione: [giaEsisteva] quando lo script l'ha trovato gia' nel foglio (e non ha creato niente). */
data class Salvataggio<T>(val dato: T, val giaEsisteva: Boolean = false)

/** Un file della cartella di una commessa su Drive. */
data class Documento(
    val id: String,
    val nome: String,
    val url: String,
    val mime: String = "",
    /** L'ultima modifica, se il foglio la dice. */
    val data: LocalDateTime? = null,
)

/** La cartella della commessa su Drive e quello che c'e' dentro, piu' recenti prima. */
data class DocumentiCommessa(val cartella: String, val documenti: List<Documento>)

/** Un allegato dell'email: di solito il PDF. */
class Allegato(val nome: String, val mime: String, val dati: ByteArray)
