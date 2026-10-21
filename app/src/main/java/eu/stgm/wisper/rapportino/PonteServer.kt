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
import java.io.IOException
import java.time.LocalDate
import java.time.LocalDateTime
import java.util.Base64
import java.util.concurrent.TimeUnit

/**
 * Il collegamento col server di Wisper sul NAS (docs/gestionale/architettura.md
 * §2, §3, §12). Parla come parlava lo script del foglio: GET `/exec?azione=` per
 * leggere, POST `/exec` col corpo JSON per scrivere, sempre HTTP 200 con
 * `{ok: true|false}`. In più ogni richiesta porta `Authorization: Bearer <token>`,
 * il token che dà [accedi]; i file arrivano da `GET /file/<id>`.
 *
 * Quattro tipi di errore, e la differenza conta per la coda:
 *  - [Rifiutato]: il server ha risposto e ha detto di no. Riprovare uguale non serve;
 *  - [PermessoNegato] (un [Rifiutato]): manca il permesso per quella cosa;
 *  - [AccessoScaduto]: il token non vale più (scaduto, revocato, utente
 *    disattivato, o non si è ancora entrati). Non è un no sul rapportino: la coda
 *    si ferma e aspetta che si rientri, senza scartare niente;
 *  - qualunque altra eccezione (anche [ServizioNonRaggiunto]): la rete. Si riprova.
 *
 * Le scritture non si ripetono mai da sole (vedi [clientScrittura]): un'email
 * ripetuta sono due email.
 */
class PonteServer(
    /** "http://10.0.2.2:8400", o l'indirizzo del NAS; va bene anche con /exec in fondo. */
    private val indirizzo: () -> String,
    private val token: () -> String,
    /** Chi chiama (disp, dispNome, app): il server li scrive nel registro degli accessi. */
    private val chiSono: () -> Map<String, String> = { emptyMap() },
    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build(),
) {

    val configurato: Boolean get() = base().isNotBlank() && token().isNotBlank()

    /** Il server ha risposto e ha detto di no, col messaggio da mostrare. */
    open class Rifiutato(messaggio: String) : Exception(messaggio)

    /** Manca il permesso (`permesso: false`): un no come gli altri, col messaggio del server. */
    class PermessoNegato(messaggio: String) : Rifiutato(messaggio)

    /** `accesso: false`, o non si è ancora entrati: si torna alla schermata di accesso, la coda aspetta. */
    class AccessoScaduto(messaggio: String = "Accesso scaduto: entra di nuovo") : Exception(messaggio)

    /** `rete: true`: il server c'è, ma un servizio dietro di lui no (il registro europeo, il postino). Si riprova. */
    class ServizioNonRaggiunto(messaggio: String) : IOException(messaggio)

    /**
     * `serveConferma: true` (§13.5, §13.7): il server si e' fermato per chiedere se
     * si vuole davvero (manca qualcosa per la legge, un appuntamento si accavalla).
     * Si richiede uguale con `conferma: true`. [risposta] ha `mancano` o `sovrapposte`.
     */
    class DaConfermare(messaggio: String, val risposta: JSONObject) : Rifiutato(messaggio)

    /** Quello che dà [accedi]. */
    data class Accesso(val token: String, val utente: Utente, val permessi: Permessi)

    /** Quello che dà [io]: chi sono, cosa posso, il nome del titolare e dello studio. */
    data class ChiSono(
        val utente: Utente,
        val permessi: Permessi,
        val titolare: String = "",
        val ragioneSociale: String = "",
        /** Il nome da proporre come compilatore. */
        val tecnico: String = "",
        /** Vero per il collaboratore: vede e scrive solo i suoi rapportini. */
        val soloSuoi: Boolean = false,
    )

    // ------------------------------------------------------------- accesso

    /** Entra con email e password: il token si salva sul telefono e vale finché non si esce. */
    suspend fun accedi(email: String, password: String): Accesso = withContext(Dispatchers.IO) {
        if (base().isBlank()) throw Rifiutato("Scrivi l'indirizzo del server")
        val corpo = JSONObject().put("azione", "accedi").put("email", email.trim()).put("password", password)
        chiSono().forEach { (k, v) -> corpo.put(k, v) }
        val r = chiama(post(corpo, conToken = false), clientScrittura)
        val t = r.testo("token").takeIf { it.isNotBlank() } ?: throw Rifiutato("Il server non ha dato l'accesso")
        Accesso(t, Utente.daJson(r.optJSONObject("utente") ?: JSONObject()), Permessi.daJson(r.optJSONObject("permessi")))
    }

    suspend fun io(): ChiSono = withContext(Dispatchers.IO) {
        val r = leggi("io")
        val i = r.optJSONObject("interfaccia")
        ChiSono(
            utente = Utente.daJson(r.optJSONObject("utente") ?: JSONObject()),
            permessi = Permessi.daJson(r.optJSONObject("permessi")),
            titolare = r.testo("titolare"),
            ragioneSociale = r.testo("ragioneSociale"),
            tecnico = i?.testo("tecnico").orEmpty(),
            soloSuoi = i?.vero("soloSuoi") == true,
        )
    }

    /** Il token non vale più, su nessun dispositivo che lo conosca. */
    suspend fun esci(): Unit = withContext(Dispatchers.IO) { scrivi(JSONObject().put("azione", "esci")); Unit }

    suspend fun cambiaPassword(vecchia: String, nuova: String): Unit = withContext(Dispatchers.IO) {
        scrivi(JSONObject().put("azione", "cambiaPassword").put("vecchia", vecchia).put("nuova", nuova)); Unit
    }

    // ------------------------------------------------------------- letture di sempre

    /** Clienti, fornitori, commesse, referenti, sedi, prestazioni, utenti, numerazioni: anche archiviati e modelli. */
    suspend fun anagrafiche(): Anagrafiche = withContext(Dispatchers.IO) {
        Anagrafiche.daJson(leggi("anagrafiche", "archiviati" to "1", "modelli" to "1"))
    }

    /** I rapportini fra due date comprese, i piu' recenti prima. */
    suspend fun rapportini(da: LocalDate, a: LocalDate): List<Rapportino> = withContext(Dispatchers.IO) {
        leggi("rapportini", "da" to da.format(Rapportino.ISO), "a" to a.format(Rapportino.ISO))
            .optJSONArray("rapportini").oggetti()
            .map { Rapportino.daJson(it, dalFoglio = true) }
    }

    /**
     * Tutti i rapportini (gli annullati no), come li legge il computer: servono al
     * cruscotto delle commesse e a "restano da fatturare dei mesi prima".
     */
    suspend fun rapportiniTutti(): List<Rapportino> = withContext(Dispatchers.IO) {
        leggi("rapportini", c = clientLetturaLunga)
            .optJSONArray("rapportini").oggetti()
            .map { Rapportino.daJson(it, dalFoglio = true) }
    }

    /** Crea o aggiorna il rapportino. Torna il rapportino come l'ha scritto il server, conti compresi. */
    suspend fun salva(r: Rapportino): Rapportino = withContext(Dispatchers.IO) {
        val risposta = scrivi(JSONObject().put("azione", "salvaRapportino").put("rapportino", r.perIlFoglio()))
        Rapportino.daJson(
            risposta.optJSONObject("rapportino") ?: throw Rifiutato("Il server non ha restituito il rapportino"),
            dalFoglio = true,
        )
    }

    /**
     * Carica una foto di spesa o una firma. [idFile] e' lo stesso a ogni
     * tentativo: se il file e' gia' arrivato, il server non ne crea un secondo.
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
     * "spesa" e "firma" del rapportino [idLocale] / [id] (per la firma anche
     * [firmatario] e [firmatoIl]); "firmaTecnico"; "documento" della commessa [idCommessa].
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
        idAttivita: String = "",
        idPreventivo: String = "",
    ): FileRemoto = withContext(Dispatchers.IO) {
        if (dati.isEmpty()) throw Rifiutato("Il file è vuoto")
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
        if (idAttivita.isNotBlank()) corpo.put("idAttivita", idJson(idAttivita))
        if (idPreventivo.isNotBlank()) corpo.put("idPreventivo", idJson(idPreventivo))
        if (nome.isNotBlank()) corpo.put("nome", nome)
        val f = scrivi(corpo).optJSONObject("file") ?: throw Rifiutato("Il server non ha salvato il file")
        FileRemoto.daJson(f)
    }

    /** @param chiave il numero RAP/... se il server l'ha gia' dato, altrimenti l'idLocale. */
    suspend fun togliFile(chiave: String, fileId: String): Rapportino = withContext(Dispatchers.IO) {
        val r = scrivi(JSONObject().put("azione", "togliFile").put("id", chiave).put("fileId", fileId))
        Rapportino.daJson(r.getJSONObject("rapportino"), dalFoglio = true)
    }

    /** BOZZA (riporta in bozza: la firma cade), INVIATO, FATTURATO, ANNULLATO. */
    suspend fun stato(chiave: String, stato: Stato): Rapportino =
        stato(listOf(chiave), stato).firstOrNull() ?: throw Rifiutato("Il server non ha restituito il rapportino")

    /** Lo stesso per tanti rapportini insieme. Le regole su cosa si puo' segnare le tiene chi chiama. */
    suspend fun stato(chiavi: List<String>, stato: Stato): List<Rapportino> = withContext(Dispatchers.IO) {
        scrivi(JSONObject().put("azione", "stato").put("ids", JSONArray(chiavi)).put("stato", stato.name))
            .optJSONArray("rapportini").oggetti()
            .map { Rapportino.daJson(it, dalFoglio = true) }
    }

    /** Un annullato torna allo stato di prima (§12.4). */
    suspend fun ripristinaRapportino(chiave: String): Rapportino = withContext(Dispatchers.IO) {
        val r = scrivi(JSONObject().put("azione", "ripristinaRapportino").put("id", chiave))
        Rapportino.daJson(r.optJSONObject("rapportino") ?: throw Rifiutato("Il server non ha restituito il rapportino"), dalFoglio = true)
    }

    // ------------------------------------------------------------- anagrafiche come prima

    /** Un cliente nuovo, come faceva lo script (senza i controlli nuovi): lo usa chi viene dalla 0.4.0. */
    suspend fun creaCliente(c: Cliente): Salvataggio<Cliente> = withContext(Dispatchers.IO) {
        val r = scrivi(
            JSONObject().put("azione", "creaCliente")
                .put("nome", c.nome.trim()).put("email", c.email.trim()).put("telefono", c.telefono.trim())
                .put("indirizzo", c.indirizzo.trim()).put("partitaIva", c.partitaIva.trim()).put("note", c.note.trim())
                .put("tariffaFissa", c.tariffaFissa ?: JSONObject.NULL)
        )
        val o = r.optJSONObject("cliente") ?: throw Rifiutato("Il server non ha restituito il cliente")
        Salvataggio(Cliente.daJson(o), o.optBoolean("giaEsisteva", false))
    }

    /** Riscrive tutta la scheda del cliente [Cliente.id], come lo script. Un campo null torna vuoto. */
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
        Cliente.daJson(r.optJSONObject("cliente") ?: throw Rifiutato("Il server non ha restituito il cliente"))
    }

    /**
     * Una commessa nuova. Con [Commessa.id] vuoto il codice lo sceglie il server
     * (il primo libero). Se lo stesso cliente ha gia' una commessa con lo stesso
     * nome torna quella, con giaEsisteva.
     *
     * @param cliente se ha la tariffa fissa o il costo fisso (Elettrodinamica),
     *        prezzo e costo restano sulla sua scheda e non si copiano sulla commessa.
     * @param costi senza il permesso dei soldi quei campi non si mandano: restano come sono.
     */
    suspend fun creaCommessa(m: Commessa, cliente: Cliente? = null, costi: Boolean = true): Salvataggio<Commessa> = withContext(Dispatchers.IO) {
        val corpo = campiCommessa(m, cliente, nuova = true, costi = costi).put("azione", "creaCommessa").put("id", m.id.trim().uppercase())
        val o = scrivi(corpo).optJSONObject("commessa") ?: throw Rifiutato("Il server non ha restituito la commessa")
        Salvataggio(Commessa.daJson(o), o.optBoolean("giaEsisteva", false))
    }

    /** Riscrive la commessa [Commessa.id], stato compreso (APERTA, SOSPESA, CHIUSA). */
    suspend fun aggiornaCommessa(m: Commessa, cliente: Cliente? = null, costi: Boolean = true): Commessa = withContext(Dispatchers.IO) {
        val r = scrivi(
            JSONObject().put("azione", "aggiornaCommessa").put("id", m.id.trim())
                .put("campi", campiCommessa(m, cliente, nuova = false, costi = costi))
        )
        Commessa.daJson(r.optJSONObject("commessa") ?: throw Rifiutato("Il server non ha restituito la commessa"))
    }

    private fun campiCommessa(m: Commessa, cliente: Cliente?, nuova: Boolean, costi: Boolean): JSONObject {
        val o = JSONObject()
            .put("idCliente", m.idCliente)
            .put("descrizione", m.descrizione.trim())
            .put("indirizzo", m.indirizzo.trim())
            .put("inizio", m.inizio?.format(Rapportino.ISO) ?: "")
            .put("finePrevista", m.finePrevista?.format(Rapportino.ISO) ?: "")
            .put("budgetOre", m.budgetOre ?: JSONObject.NULL)
            .put("note", m.note.trim())
            .put("sedeId", m.idSede.takeIf { it.isNotBlank() }?.let(::idJson) ?: JSONObject.NULL)
            .put("responsabileId", m.idResponsabile.takeIf { it.isNotBlank() }?.let(::idJson) ?: JSONObject.NULL)
            .put("persone", JSONArray(m.persone.map(::idJson)))
        if (costi) {
            o.put("budgetEuro", m.budgetEuro ?: JSONObject.NULL)
            o.put("euroKm", m.euroKm ?: JSONObject.NULL)
            o.put("importoContratto", m.importoContratto ?: JSONObject.NULL)
            if (cliente?.tariffaFissa == null) o.put("prezzoOrario", m.prezzoOrario ?: JSONObject.NULL)
            if (cliente?.costoFisso == null) o.put("costoOrario", m.costoOrario ?: JSONObject.NULL)
        }
        // Una commessa nuova nasce sempre APERTA: lo decide il server.
        if (!nuova) o.put("stato", m.stato.trim().uppercase().ifBlank { "APERTA" })
        return o
    }

    /** Scrive le impostazioni date (le altre restano). EURO_KM e COSTO_ORARIO vanno come numero. */
    suspend fun salvaImpostazioni(valori: Map<String, Any?>): Map<String, String> = withContext(Dispatchers.IO) {
        val v = JSONObject()
        valori.forEach { (k, x) -> v.put(k, x ?: "") }
        val r = scrivi(JSONObject().put("azione", "salvaImpostazioni").put("valori", v))
        Anagrafiche.impostazioniDaJson(r.optJSONObject("impostazioni"))
    }

    // ------------------------------------------------------------- file e documenti

    /** I documenti della commessa, piu' recenti prima. */
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
                    data = d.testo("data").takeIf { it.isNotBlank() }?.let { runCatching { LocalDateTime.parse(it.take(19)) }.getOrNull() },
                )
            },
        )
    }

    /**
     * Un file (firme, scontrini, documenti, la firma del compilatore) da
     * `GET /file/<id>`: i byte e il tipo. Qui contano i codici HTTP: 401 accesso
     * scaduto, 403 niente permesso, 404 il file non c'e' (o non e' ancora stato
     * copiato da Drive).
     */
    suspend fun file(id: String): Pair<ByteArray, String> = withContext(Dispatchers.IO) {
        controllaConfigurazione()
        val u = (base() + "/file/" + java.net.URLEncoder.encode(id, "UTF-8")).toHttpUrlOrNull()
            ?: throw Rifiutato("Indirizzo del server non valido")
        val richiesta = Request.Builder().url(u).get()
            .header("Authorization", "Bearer " + token())
            .apply { chiSono()["disp"]?.let { header("X-Wisper-Disp", it) } }
            .build()
        clientLetturaLunga.newCall(richiesta).execute().use { r ->
            when (r.code) {
                401 -> throw AccessoScaduto()
                403 -> throw PermessoNegato("Non hai il permesso per vedere questo file")
                404 -> throw Rifiutato("Il file non c'è")
            }
            if (!r.isSuccessful) throw IOException("HTTP ${r.code}")
            val tipo = (r.header("Content-Type") ?: r.body?.contentType()?.toString())?.substringBefore(';')?.trim()?.ifBlank { null }
            val byte = r.body?.bytes() ?: throw IOException("risposta vuota")
            byte to (tipo ?: "application/octet-stream")
        }
    }

    // ------------------------------------------------------------- email

    /**
     * Manda l'email dal postino, coi PDF allegati, e segna inviati i rapportini
     * [chiavi] (non i fatturati). Con [aMe] la manda solo allo studio, come prova.
     * MAI ripetuta da sola: se la risposta non arriva l'email puo' essere partita lo stesso.
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

    // ------------------------------------------------------------- il gestionale (fase 1, §12)

    /** La pagina iniziale, come la manda il server (la si legge con Dashboard.daJson). */
    suspend fun dashboard(): JSONObject = withContext(Dispatchers.IO) { leggi("dashboard") }

    /**
     * Crea (senza id) o cambia un cliente o un fornitore con tutti i campi nuovi.
     * Le regole della tariffa si mandano solo con il permesso dei soldi.
     */
    suspend fun salvaSoggetto(s: Cliente, nuovo: Boolean, costi: Boolean): Salvataggio<Cliente> = withContext(Dispatchers.IO) {
        val o = JSONObject()
            .put("nome", s.nome.trim()).put("cliente", s.cliente).put("fornitore", s.fornitore)
            .put("alias", JSONArray(s.alias.map { it.trim() }.filter { it.isNotBlank() }))
            .put("email", s.email.trim()).put("pec", s.pec.trim()).put("telefono", s.telefono.trim())
            .put("partitaIva", s.partitaIva.trim()).put("codiceFiscale", s.codiceFiscale.trim())
            .put("codiceSdi", s.codiceSdi.trim()).put("indirizzo", s.indirizzo.trim()).put("cap", s.cap.trim())
            .put("citta", s.citta.trim()).put("provincia", s.provincia.trim()).put("nazione", s.nazione.trim().ifBlank { "IT" })
            .put("note", s.note.trim())
        if (!nuovo) o.put("id", s.id)
        if (costi) {
            o.put("tariffaFissa", s.tariffaFissa ?: JSONObject.NULL).put("costoFisso", s.costoFisso ?: JSONObject.NULL)
                .put("ultimaTariffa", s.ultimaTariffa ?: JSONObject.NULL).put("pagaViaggio", s.pagaViaggio ?: JSONObject.NULL)
                .put("kmRimborsati", s.kmRimborsati ?: JSONObject.NULL).put("maggExtra", s.maggExtra ?: JSONObject.NULL)
        }
        val r = scrivi(JSONObject().put("azione", "salvaSoggetto").put("soggetto", o))
        val x = r.optJSONObject("soggetto") ?: throw Rifiutato("Il server non ha restituito l'anagrafica")
        Salvataggio(Cliente.daJson(x), x.optBoolean("giaEsisteva", false))
    }

    suspend fun archiviaSoggetto(id: String, archivia: Boolean): Cliente = withContext(Dispatchers.IO) {
        val r = scrivi(JSONObject().put("azione", if (archivia) "archiviaSoggetto" else "ripristinaSoggetto").put("id", id))
        Cliente.daJson(r.optJSONObject("soggetto") ?: JSONObject().put("id", id))
    }

    suspend fun controllaPartitaIva(partitaIva: String, nazione: String = "IT"): DatiPartitaIva = withContext(Dispatchers.IO) {
        val r = leggi("controllaPartitaIva", "partitaIva" to partitaIva.trim(), "nazione" to nazione, c = clientLetturaLunga)
        DatiPartitaIva(
            valida = r.vero("valida"),
            nome = r.testo("nome"),
            indirizzo = r.testo("indirizzo"),
            cap = r.testo("cap"),
            citta = r.testo("citta"),
            provincia = r.testo("provincia"),
        )
    }

    suspend fun salvaReferente(x: Referente): Referente = withContext(Dispatchers.IO) {
        val o = JSONObject().put("idSoggetto", x.idSoggetto).put("nome", x.nome.trim()).put("ruolo", x.ruolo.trim())
            .put("email", x.email.trim()).put("telefono", x.telefono.trim()).put("note", x.note.trim())
        if (x.id.isNotBlank()) o.put("id", idJson(x.id)).put("ordine", x.ordine)
        val r = scrivi(JSONObject().put("azione", "salvaReferente").put("referente", o))
        Referente.daJson(r.optJSONObject("referente") ?: throw Rifiutato("Il server non ha restituito il referente"))
    }

    suspend fun togliReferente(id: String): Unit = withContext(Dispatchers.IO) {
        scrivi(JSONObject().put("azione", "togliReferente").put("id", idJson(id))); Unit
    }

    suspend fun salvaSede(x: Sede): Sede = withContext(Dispatchers.IO) {
        val o = JSONObject().put("idSoggetto", x.idSoggetto).put("tipo", x.tipo).put("nome", x.nome.trim())
            .put("indirizzo", x.indirizzo.trim()).put("cap", x.cap.trim()).put("citta", x.citta.trim())
            .put("provincia", x.provincia.trim()).put("note", x.note.trim()).put("archiviata", x.archiviata)
        if (x.id.isNotBlank()) o.put("id", idJson(x.id))
        val r = scrivi(JSONObject().put("azione", "salvaSede").put("sede", o))
        Sede.daJson(r.optJSONObject("sede") ?: throw Rifiutato("Il server non ha restituito la sede"))
    }

    suspend fun archiviaSede(id: String, archivia: Boolean): Sede = withContext(Dispatchers.IO) {
        val r = scrivi(JSONObject().put("azione", "archiviaSede").put("id", idJson(id)).put("archiviata", archivia))
        Sede.daJson(r.optJSONObject("sede") ?: JSONObject().put("id", id))
    }

    /** Il valore si manda solo con il permesso dei soldi. */
    suspend fun salvaPrestazione(p: Prestazione, costi: Boolean): Prestazione = withContext(Dispatchers.IO) {
        val o = JSONObject().put("idCommessa", p.idCommessa).put("nome", p.nome.trim()).put("descrizione", p.descrizione.trim())
            .put("avanzamento", p.avanzamento.coerceIn(0, 100))
        if (costi) o.put("valore", p.valore ?: JSONObject.NULL)
        if (p.id.isNotBlank()) o.put("id", idJson(p.id)).put("ordine", p.ordine)
        val r = scrivi(JSONObject().put("azione", "salvaPrestazione").put("prestazione", o))
        Prestazione.daJson(r.optJSONObject("prestazione") ?: throw Rifiutato("Il server non ha restituito la prestazione"))
    }

    suspend fun togliPrestazione(id: String): Unit = withContext(Dispatchers.IO) {
        scrivi(JSONObject().put("azione", "togliPrestazione").put("id", idJson(id))); Unit
    }

    /** Le prestazioni nell'ordine dato, dalla prima all'ultima. */
    suspend fun ordinaPrestazioni(idCommessa: String, ids: List<String>): List<Prestazione> = withContext(Dispatchers.IO) {
        scrivi(JSONObject().put("azione", "ordinaPrestazioni").put("idCommessa", idCommessa).put("ids", JSONArray(ids.map(::idJson))))
            .optJSONArray("prestazioni").oggetti().map(Prestazione::daJson)
    }

    suspend fun duplicaCommessa(id: String, comeModello: Boolean): Commessa = withContext(Dispatchers.IO) {
        val r = scrivi(JSONObject().put("azione", "duplicaCommessa").put("id", id).put("comeModello", comeModello))
        Commessa.daJson(r.optJSONObject("commessa") ?: throw Rifiutato("Il server non ha restituito la commessa"))
    }

    suspend fun archiviaCommessa(id: String, archivia: Boolean): Commessa = withContext(Dispatchers.IO) {
        val r = scrivi(JSONObject().put("azione", if (archivia) "archiviaCommessa" else "ripristinaCommessa").put("id", id))
        Commessa.daJson(r.optJSONObject("commessa") ?: JSONObject().put("id", id))
    }

    suspend fun utenti(): List<Utente> = withContext(Dispatchers.IO) {
        leggi("utenti").optJSONArray("utenti").oggetti().map(Utente::daJson)
    }

    /** Crea (id vuoto) o cambia un utente. Uno nuovo riceve la password iniziale dal server: si mostra una volta sola. */
    suspend fun salvaUtente(u: Utente): UtenteSalvato = withContext(Dispatchers.IO) {
        val o = JSONObject().put("nome", u.nome.trim()).put("email", u.email.trim()).put("ruolo", u.ruolo).put("attivo", u.attivo)
        if (u.id.isNotBlank()) o.put("id", idJson(u.id))
        val r = scrivi(JSONObject().put("azione", "salvaUtente").put("utente", o))
        UtenteSalvato(Utente.daJson(r.optJSONObject("utente") ?: throw Rifiutato("Il server non ha restituito l'utente")), r.testo("passwordIniziale"))
    }

    /** Una password nuova scelta dal server (i suoi dispositivi escono). I trattini fanno parte della password. */
    suspend fun nuovaPassword(idUtente: String): String = withContext(Dispatchers.IO) {
        scrivi(JSONObject().put("azione", "nuovaPassword").put("idUtente", idJson(idUtente))).testo("passwordIniziale")
            .ifBlank { throw Rifiutato("Il server non ha dato la password nuova") }
    }

    suspend fun sessioni(idUtente: String): List<Dispositivo> = withContext(Dispatchers.IO) {
        leggi("sessioni", "idUtente" to idUtente).optJSONArray("sessioni").oggetti().map(Dispositivo::daJson)
    }

    suspend fun revocaSessione(id: String): Unit = withContext(Dispatchers.IO) {
        scrivi(JSONObject().put("azione", "revocaSessione").put("id", idJson(id))); Unit
    }

    /** I permessi di ogni ruolo. */
    suspend fun permessi(): Map<String, Permessi> = withContext(Dispatchers.IO) {
        permessiDa(leggi("permessi"))
    }

    /** Un livello di un modulo per un ruolo: vale subito, anche per chi è già dentro. */
    suspend fun salvaPermesso(ruolo: String, modulo: String, livello: Int): Map<String, Permessi> = withContext(Dispatchers.IO) {
        permessiDa(scrivi(JSONObject().put("azione", "salvaPermessi").put("permessi", JSONObject().put(ruolo, JSONObject().put(modulo, livello)))))
    }

    private fun permessiDa(r: JSONObject): Map<String, Permessi> {
        val p = r.optJSONObject("permessi") ?: return emptyMap()
        return p.keys().asSequence().associateWith { Permessi.daJson(p.optJSONObject(it)) }
    }

    /** Il registro, i piu' recenti prima, 100 per pagina. [FiltroRegistro.pagina] parte da 0. */
    suspend fun registro(f: FiltroRegistro): PaginaRegistro = withContext(Dispatchers.IO) {
        val r = leggi("registro", *parametriRegistro(f).toTypedArray(), "pagina" to (f.pagina + 1).toString())
        PaginaRegistro(
            voci = r.optJSONArray("righe").oggetti().map(VoceRegistro::daJson),
            altre = r.optInt("pagina", 1) < r.optInt("pagine", 1),
        )
    }

    private fun parametriRegistro(f: FiltroRegistro): List<Pair<String, String>> = buildList {
        if (f.giorni > 0) add("da" to LocalDate.now().minusDays(f.giorni.toLong() - 1).format(Rapportino.ISO))
        if (f.utente.isNotBlank()) add("utente" to f.utente)
        if (f.tabella.isNotBlank()) add("tabella" to f.tabella)
    }

    suspend fun salvaNumerazione(n: Numerazione): Numerazione = withContext(Dispatchers.IO) {
        val r = scrivi(JSONObject().put("azione", "salvaNumerazione").put("tipo", n.tipo).put("formato", n.formato).put("annuale", n.annuale))
        Numerazione.daJson(r.optJSONObject("numerazione") ?: throw Rifiutato("Il server non ha restituito la numerazione"))
    }

    suspend fun cestino(): List<FileCestino> = withContext(Dispatchers.IO) {
        leggi("cestino").optJSONArray("file").oggetti().map(FileCestino::daJson)
    }

    suspend fun ripristinaFile(id: String): Unit = withContext(Dispatchers.IO) {
        scrivi(JSONObject().put("azione", "ripristinaFile").put("id", id)); Unit
    }

    /**
     * Un file per Excel: [cosa] = rapportini, clienti, fornitori, commesse,
     * registro (col filtro del registro). Torna nome, tipo e byte, come li dà il server.
     */
    suspend fun esporta(cosa: String, filtro: FiltroRegistro? = null): Triple<String, String, ByteArray> = withContext(Dispatchers.IO) {
        val parametri = buildList {
            add("cosa" to cosa)
            if (cosa == "registro" && filtro != null) addAll(parametriRegistro(filtro))
            if (cosa == "rapportini") add("tutti" to "1")
        }
        val r = leggi("esporta", *parametri.toTypedArray(), c = clientLetturaLunga)
        val byte = try {
            Base64.getMimeDecoder().decode(r.testo("base64"))
        } catch (_: IllegalArgumentException) {
            throw Rifiutato("Il file arrivato dal server non si legge")
        }
        Triple(r.testo("nome").ifBlank { "wisper-$cosa.csv" }, r.testo("mime").ifBlank { "text/csv" }, byte)
    }

    suspend fun copie(): StatoCopie = withContext(Dispatchers.IO) { StatoCopie.daJson(leggi("copie")) }

    suspend fun copiaAdesso(): CopiaSicurezza = withContext(Dispatchers.IO) {
        val r = chiama(post(JSONObject().put("azione", "copiaAdesso")), clientLetturaLunga.newBuilder().retryOnConnectionFailure(false).build())
        CopiaSicurezza.daJson(r.optJSONObject("copia") ?: JSONObject())
    }

    // ------------------------------------------------------------- fase 2: preventivi (fase2.md §4, architettura.md §13)

    suspend fun listino(): List<VoceListino> = withContext(Dispatchers.IO) {
        val r = leggi("listino")
        (r.optJSONArray("listino") ?: r.optJSONArray("voci")).oggetti().map(VoceListino::daJson)
    }

    /** Il prezzo si manda solo con il permesso dei soldi. */
    suspend fun salvaVoceListino(v: VoceListino, costi: Boolean): VoceListino = withContext(Dispatchers.IO) {
        val o = JSONObject().put("nome", v.nome.trim()).put("codice", v.codice.trim()).put("descrizione", v.descrizione.trim())
            .put("modo", v.modo).put("unita", v.unita.trim()).put("ordine", v.ordine)
        if (costi) o.put("prezzo", v.prezzo ?: JSONObject.NULL)
        if (v.id.isNotBlank()) o.put("id", idJson(v.id))
        val r = scrivi(JSONObject().put("azione", "salvaVoceListino").put("voce", o))
        VoceListino.daJson(r.optJSONObject("voce") ?: r.optJSONObject("listino") ?: throw Rifiutato("Il server non ha restituito la voce del listino"))
    }

    suspend fun archiviaVoceListino(id: String, archiviata: Boolean = true): Unit = withContext(Dispatchers.IO) {
        scrivi(JSONObject().put("azione", "archiviaVoceListino").put("id", idJson(id)).put("archiviata", archiviata)); Unit
    }

    /** L'elenco, con totali e stato calcolato (anche SCADUTO). */
    suspend fun preventivi(stato: String = "", testo: String = "", anno: Int? = null, modelli: Boolean = false): List<Preventivo> = withContext(Dispatchers.IO) {
        val parametri = buildList {
            if (modelli) add("modelli" to "1")
            if (stato.isNotBlank()) add("stato" to stato)
            if (testo.isNotBlank()) add("testo" to testo)
            if (anno != null) add("anno" to anno.toString())
        }
        leggi("preventivi", *parametri.toTypedArray()).optJSONArray("preventivi").oggetti().map(Preventivo::daJson)
    }

    /** Tutto il preventivo: sezioni, voci, scadenze, revisioni, conti e quello che manca per la legge. */
    suspend fun preventivo(id: String): Preventivo = withContext(Dispatchers.IO) {
        Preventivo.daJson(leggi("preventivo", "id" to id))
    }

    suspend fun salvaPreventivo(p: Preventivo, costi: Boolean): Preventivo = withContext(Dispatchers.IO) {
        conPreventivo(scrivi(JSONObject().put("azione", "salvaPreventivo").put("preventivo", perSalvare(p, costi))))
    }

    suspend fun duplicaPreventivo(id: String, comeModello: Boolean): Preventivo = withContext(Dispatchers.IO) {
        conPreventivo(scrivi(JSONObject().put("azione", "duplicaPreventivo").put("id", idJson(id)).put("comeModello", comeModello)))
    }

    suspend fun nuovaRevisione(id: String): Preventivo = withContext(Dispatchers.IO) {
        conPreventivo(scrivi(JSONObject().put("azione", "nuovaRevisione").put("id", idJson(id))))
    }

    /** L'email col PDF: come inviaEmail, MAI ripetuta da sola. */
    suspend fun inviaPreventivo(
        id: String, a: String, cc: String, oggetto: String, messaggio: String, allegati: List<Allegato>, aMe: Boolean, conferma: Boolean = false,
    ): Preventivo =
        withContext(Dispatchers.IO) {
            val corpo = JSONObject().put("azione", "inviaPreventivo").put("id", idJson(id))
                .put("a", a.trim()).put("cc", cc.trim()).put("oggetto", oggetto).put("messaggio", messaggio)
                .put("allegati", JSONArray().apply {
                    allegati.forEach { put(JSONObject().put("nome", it.nome).put("mime", it.mime).put("base64", Base64.getEncoder().encodeToString(it.dati))) }
                })
                .put("aMe", aMe)
            if (conferma) corpo.put("conferma", true)
            conPreventivo(scrivi(corpo))
        }

    suspend fun segnaInviato(id: String, conferma: Boolean = false): Preventivo = withContext(Dispatchers.IO) {
        val corpo = JSONObject().put("azione", "segnaInviato").put("id", idJson(id))
        if (conferma) corpo.put("conferma", true)
        conPreventivo(scrivi(corpo))
    }

    /**
     * [firma]: il PNG della firma col dito o il foglio firmato ({base64, mime, idFile}).
     * [idFile] resta lo stesso a ogni tentativo: ripetuta uguale, il server non rifà niente.
     */
    suspend fun accettaPreventivo(id: String, modo: String, nome: String, scelte: Map<String, Boolean>, firma: Allegato? = null, idFile: String = ""): Preventivo =
        withContext(Dispatchers.IO) {
            val corpo = JSONObject().put("azione", "accettaPreventivo").put("id", idJson(id)).put("modo", modo).put("nome", nome.trim())
                .put("scelte", JSONObject().apply { scelte.forEach { (k, v) -> put(k, v) } })
            if (firma != null) {
                corpo.put(
                    "firma",
                    JSONObject().put("nome", firma.nome).put("mime", firma.mime).put("base64", Base64.getEncoder().encodeToString(firma.dati))
                        .apply { if (idFile.isNotBlank()) put("idFile", idFile) },
                )
            }
            conPreventivo(scrivi(corpo))
        }

    suspend fun rifiutaPreventivo(id: String, motivo: String): Preventivo = withContext(Dispatchers.IO) {
        conPreventivo(scrivi(JSONObject().put("azione", "rifiutaPreventivo").put("id", idJson(id)).put("motivo", motivo.trim())))
    }

    suspend fun riapriPreventivo(id: String): Preventivo = withContext(Dispatchers.IO) {
        conPreventivo(scrivi(JSONObject().put("azione", "riapriPreventivo").put("id", idJson(id))))
    }

    /** Quello che torna da creaCommessaDaPreventivo (§13.5). */
    data class CommessaNata(val commessa: Commessa, val prestazioni: List<Prestazione>, val preventivo: Preventivo?)

    /** La commessa nuova con le sue prestazioni, e il preventivo che ora la conosce. */
    suspend fun creaCommessaDaPreventivo(id: String): CommessaNata = withContext(Dispatchers.IO) {
        val r = scrivi(JSONObject().put("azione", "creaCommessaDaPreventivo").put("id", idJson(id)))
        val m = Commessa.daJson(r.optJSONObject("commessa") ?: throw Rifiutato("Il server non ha restituito la commessa"))
        CommessaNata(m, r.optJSONArray("prestazioni").oggetti().map(Prestazione::daJson), r.optJSONObject("preventivo")?.let(Preventivo::daJson))
    }

    private fun conPreventivo(r: JSONObject): Preventivo {
        val p = r.optJSONObject("preventivo") ?: throw Rifiutato("Il server non ha restituito il preventivo")
        if (!p.has("mancano") && r.has("mancano")) p.put("mancano", r.get("mancano"))
        if (!p.has("conti") && r.has("conti")) p.put("conti", r.get("conti"))
        return Preventivo.daJson(p)
    }

    /** Il preventivo da salvare: testata, sezioni con le voci, scadenze. I prezzi e gli sconti solo con i soldi. */
    internal fun perSalvare(p: Preventivo, costi: Boolean): JSONObject {
        val o = JSONObject()
            .put("idCliente", p.idCliente)
            .put("idSede", p.idSede.takeIf { it.isNotBlank() }?.let(::idJson) ?: JSONObject.NULL)
            .put("idReferente", p.idReferente.takeIf { it.isNotBlank() }?.let(::idJson) ?: JSONObject.NULL)
            .put("oggetto", p.oggetto.trim()).put("introduzione", p.introduzione.trim())
            .put("complessita", p.complessita).put("complessitaNota", p.complessitaNota.trim())
            .put("oneriPrevisti", p.oneriPrevisti.trim()).put("condizioni", p.condizioni.trim())
            .put("modello", p.modello).put("noteInterne", p.noteInterne.trim())
        // Senza data e scadenza un preventivo nuovo prende oggi e la validità delle impostazioni.
        p.data?.let { o.put("data", it.toString()) }
        p.scadenza?.let { o.put("scadenza", it.toString()) }
        o
            .put("sezioni", JSONArray().apply {
                p.sezioni.forEachIndexed { i, s ->
                    val js = JSONObject().put("titolo", s.titolo.trim()).put("ordine", i + 1)
                    if (s.id.isNotBlank() && !s.id.startsWith(NUOVO)) js.put("id", idJson(s.id))
                    js.put("voci", JSONArray().apply {
                        s.voci.forEachIndexed { j, v ->
                            val jv = JSONObject().put("descrizione", v.descrizione.trim()).put("modo", v.modo).put("quantita", v.quantita)
                                .put("unita", v.unita.trim()).put("facoltativa", v.facoltativa)
                                .put("alternativa", v.alternativa.trim()).put("scelta", v.scelta).put("ordine", j + 1)
                                .put("idListino", v.idListino.takeIf { it.isNotBlank() }?.let(::idJson) ?: JSONObject.NULL)
                            if (costi) jv.put("prezzo", v.prezzo ?: JSONObject.NULL).put("scontoPercentuale", v.scontoPercentuale)
                            if (v.id.isNotBlank() && !v.id.startsWith(NUOVO)) jv.put("id", idJson(v.id))
                            put(jv)
                        }
                    })
                    put(js)
                }
            })
            .put("scadenzePagamento", JSONArray().apply {
                p.scadenzePagamento.forEach { s ->
                    val js = JSONObject().put("descrizione", s.descrizione.trim()).put("tipo", s.tipo).put("valore", s.valore)
                        .put("quando", s.quando).put("data", s.data?.toString() ?: "")
                    if (s.id.isNotBlank() && !s.id.startsWith(NUOVO)) js.put("id", idJson(s.id))
                    put(js)
                }
            })
        if (costi) o.put("scontoPercentuale", p.scontoPercentuale).put("scontoEuro", p.scontoEuro)
        if (p.id.isNotBlank()) o.put("id", idJson(p.id))
        return o
    }

    // ------------------------------------------------------------- fase 2: attività

    /**
     * Senza [da] e [a]: le aperte di ogni giorno, scadute e senza data comprese (l'elenco);
     * con le date: quelle del periodo in ogni stato tranne le annullate (il calendario).
     */
    suspend fun attivita(da: LocalDate?, a: LocalDate?, assegnata: String = "", commessa: String = ""): List<Attivita> = withContext(Dispatchers.IO) {
        val parametri = buildList {
            if (da != null) add("da" to da.toString())
            if (a != null) add("a" to a.toString())
            if (assegnata.isNotBlank()) add("assegnata" to assegnata)
            if (commessa.isNotBlank()) add("commessa" to commessa)
        }
        leggi("attivita", *parametri.toTypedArray()).optJSONArray("attivita").oggetti().map(Attivita::daJson)
    }

    /** [conRicorrenza]: manda la regola (nuova o cambiata); [conferma]: salva anche se si accavalla. */
    suspend fun salvaAttivita(a: Attivita, perRicorrenza: String? = null, conRicorrenza: Boolean = true, conferma: Boolean = false): Attivita =
        withContext(Dispatchers.IO) {
            val corpo = JSONObject().put("azione", "salvaAttivita").put("attivita", a.perSalvare(conRicorrenza))
            if (!perRicorrenza.isNullOrBlank()) corpo.put("perRicorrenza", perRicorrenza)
            if (conferma) corpo.put("conferma", true)
            conAttivita(scrivi(corpo))
        }

    /** Toglie un allegato (va nel cestino): torna l'attività. */
    suspend fun togliAllegato(idFile: String): Attivita? = withContext(Dispatchers.IO) {
        scrivi(JSONObject().put("azione", "togliAllegato").put("id", idFile)).optJSONObject("attivita")?.let(Attivita::daJson)
    }

    suspend fun faiAttivita(id: String, fatta: Boolean): Attivita = withContext(Dispatchers.IO) {
        conAttivita(scrivi(JSONObject().put("azione", "faiAttivita").put("id", idJson(id)).put("fatta", fatta)))
    }

    suspend fun togliAttivita(id: String, perRicorrenza: String? = null): Unit = withContext(Dispatchers.IO) {
        val corpo = JSONObject().put("azione", "togliAttivita").put("id", idJson(id))
        if (!perRicorrenza.isNullOrBlank()) corpo.put("perRicorrenza", perRicorrenza)
        scrivi(corpo); Unit
    }

    /** [idVoce] e' la voce della checklist; torna l'attività com'è adesso. */
    suspend fun spuntaChecklist(idVoce: String, fatta: Boolean): Attivita? = withContext(Dispatchers.IO) {
        scrivi(JSONObject().put("azione", "spuntaChecklist").put("id", idJson(idVoce)).put("fatta", fatta))
            .optJSONObject("attivita")?.let(Attivita::daJson)
    }

    private fun conAttivita(r: JSONObject): Attivita =
        Attivita.daJson(r.optJSONObject("attivita") ?: throw Rifiutato("Il server non ha restituito l'attività"))

    // ------------------------------------------------------------- interno

    /** L'indirizzo base, senza la barra e senza /exec in fondo. */
    private fun base(): String = indirizzo().trim().trimEnd('/').removeSuffix("/exec").trimEnd('/')

    private fun leggi(azione: String, vararg parametri: Pair<String, String>, c: OkHttpClient = client): JSONObject {
        controllaConfigurazione()
        val u = (base() + "/exec").toHttpUrlOrNull()?.newBuilder()
            ?.addQueryParameter("azione", azione)
            ?.apply { chiSono().forEach { (k, v) -> addQueryParameter(k, v) } }
            ?.apply { parametri.forEach { (k, v) -> addQueryParameter(k, v) } }
            ?.build()
            ?: throw Rifiutato("Indirizzo del server non valido: controllalo nella schermata di accesso")
        return chiama(Request.Builder().url(u).get().header("Authorization", "Bearer " + token()).build(), c)
    }

    private fun scrivi(corpo: JSONObject): JSONObject {
        controllaConfigurazione()
        return chiama(post(corpo), clientScrittura)
    }

    private fun post(corpo: JSONObject, conToken: Boolean = true): Request {
        chiSono().forEach { (k, v) -> if (!corpo.has(k)) corpo.put(k, v) }
        val u = (base() + "/exec").toHttpUrlOrNull() ?: throw Rifiutato("Indirizzo del server non valido: controllalo nella schermata di accesso")
        return Request.Builder()
            .url(u)
            // text/plain di proposito, come con lo script: il server legge comunque il corpo grezzo.
            .post(corpo.toString().toRequestBody("text/plain;charset=utf-8".toMediaType()))
            .apply { if (conToken) header("Authorization", "Bearer " + token()) }
            .build()
    }

    /**
     * Per le scritture si aspetta di piu', e una scrittura non si ripete MAI da
     * sola, neanche quando OkHttp crede che la connessione sia caduta prima della
     * risposta: l'email riprovata sono due email. Riprova la coda (che lo sa fare
     * senza doppioni) o chi usa l'app.
     */
    private val clientScrittura: OkHttpClient by lazy {
        client.newBuilder().readTimeout(90, TimeUnit.SECONDS).writeTimeout(60, TimeUnit.SECONDS)
            .retryOnConnectionFailure(false)
            .build()
    }

    /** Tutti i rapportini, un file, un'esportazione: risposte grandi, si aspetta come per le scritture. */
    private val clientLetturaLunga: OkHttpClient by lazy {
        client.newBuilder().readTimeout(90, TimeUnit.SECONDS).build()
    }

    /** Senza indirizzo o senza token non si parte: non è un no del server, si aspetta l'accesso. */
    private fun controllaConfigurazione() {
        if (base().isBlank()) throw AccessoScaduto("Manca l'indirizzo del server: entra di nuovo")
        if (token().isBlank()) throw AccessoScaduto("Entra in Wisper per continuare")
    }

    private fun chiama(richiesta: Request, c: OkHttpClient): JSONObject {
        c.newCall(richiesta).execute().use { r ->
            val testo = r.body?.string().orEmpty()
            if (!r.isSuccessful) throw IOException("HTTP ${r.code}")
            val json = try {
                JSONObject(testo)
            } catch (_: Exception) {
                throw Rifiutato("Risposta non valida dal server: controlla l'indirizzo")
            }
            if (!json.optBoolean("ok")) {
                val errore = json.optString("errore").ifBlank { "Errore sconosciuto" }
                when {
                    json.has("accesso") && !json.optBoolean("accesso", true) -> throw AccessoScaduto(errore)
                    json.has("permesso") && !json.optBoolean("permesso", true) -> throw PermessoNegato(errore)
                    json.optBoolean("rete", false) -> throw ServizioNonRaggiunto(errore)
                    json.optBoolean("serveConferma", false) -> throw DaConfermare(errore, json)
                    else -> throw Rifiutato(errore)
                }
            }
            return json
        }
    }

    companion object {
        /** Gli id del database sono numeri: si mandano come numeri quando lo sono. */
        fun idJson(id: String): Any = id.trim().toLongOrNull() ?: id.trim()

        /** Il segno degli id nati sul telefono (sezioni, voci, scadenze ancora da salvare): non si mandano al server. */
        const val NUOVO = "nuovo-"
    }
}

/** Il risultato di una creazione: [giaEsisteva] quando il server l'ha trovato gia' (e non ha creato niente). */
data class Salvataggio<T>(val dato: T, val giaEsisteva: Boolean = false)

/** Un documento della commessa. */
data class Documento(
    val id: String,
    val nome: String,
    val url: String,
    val mime: String = "",
    /** L'ultima modifica, se il server la dice. */
    val data: LocalDateTime? = null,
)

/** La cartella della commessa (quella di Drive, per i documenti di prima) e quello che c'e' dentro. */
data class DocumentiCommessa(val cartella: String, val documenti: List<Documento>)

/** Un allegato dell'email: di solito il PDF. */
class Allegato(val nome: String, val mime: String, val dati: ByteArray)
