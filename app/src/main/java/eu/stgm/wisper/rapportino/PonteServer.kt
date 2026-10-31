package eu.stgm.wisper.rapportino

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
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
 * Dal 31/10/2026 le strade sono due ([Strade], docs/gestionale/porta-google.md):
 * in casa il server direttamente, da fuori lo script Google che tiene le
 * richieste per lui. Le risposte sono le stesse: qui non cambia niente.
 *
 * Quattro tipi di errore, e la differenza conta per la coda:
 *  - [Rifiutato]: il server ha risposto e ha detto di no. Riprovare uguale non serve;
 *  - [PermessoNegato] (un [Rifiutato]): manca il permesso per quella cosa;
 *  - [AccessoScaduto]: il token non vale più (scaduto, revocato, utente
 *    disattivato, o non si è ancora entrati). Non è un no sul rapportino: la coda
 *    si ferma e aspetta che si rientri, senza scartare niente;
 *  - qualunque altra eccezione (anche [ServizioNonRaggiunto], e le risposte
 *    "riprova" della porta Google): la rete. Si riprova, con lo stesso id.
 *
 * Le scritture non si ripetono mai da sole (vedi [Strade]): un'email ripetuta
 * sono due email.
 */
class PonteServer(
    /** Il server di casa: "http://192.168.1.51:8400", o "http://10.0.2.2:8400" per l'emulatore; va bene anche con /exec in fondo. */
    private val indirizzo: () -> String,
    private val token: () -> String,
    /** Chi chiama (disp, dispNome, app): il server li scrive nel registro degli accessi. */
    private val chiSono: () -> Map<String, String> = { emptyMap() },
    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build(),
    /** La porta Google: l'indirizzo dello script (quello che finisce con /exec). Vuoto = solo casa. */
    private val google: () -> String = { "" },
) : TrasportoFase5 {

    /** Le due strade e la regola di casa. */
    val strade = Strade(indirizzo, google, token, client)

    val configurato: Boolean get() = (base().isNotBlank() || google().isNotBlank()) && token().isNotBlank()

    /** La rete del telefono è cambiata: casa o Google si sceglie di nuovo alla prossima richiesta. */
    fun reteCambiata() = strade.reteCambiata()

    /** Il server ha risposto e ha detto di no, col messaggio da mostrare. */
    open class Rifiutato(messaggio: String) : Exception(messaggio)

    /** Manca il permesso (`permesso: false`): un no come gli altri, col messaggio del server. */
    class PermessoNegato(messaggio: String) : Rifiutato(messaggio)

    /** `accesso: false`, o non si è ancora entrati: si torna alla schermata di accesso, la coda aspetta. */
    class AccessoScaduto(messaggio: String = "Accesso scaduto: entra di nuovo") : Exception(messaggio)

    /**
     * `rete: true`: il server c'è, ma un servizio dietro di lui no (il registro
     * europeo, il postino); o la porta Google dice "riprova" ([porta]: `spento`,
     * `attesa`, `occupato`; `google` se a non rispondere è Google stesso). Si riprova.
     */
    open class ServizioNonRaggiunto(messaggio: String, val porta: String = "") : IOException(messaggio)

    /**
     * Troppo grande per passare da Google (oltre circa 26 MB, porta-google.md §3,
     * §7). Riprovare via Google non serve, ma non è un no: la coda la tiene e parte
     * da sola quando il telefono è in ufficio (la strada di casa non ha il limite).
     */
    class SoloInUfficio(messaggio: String) : ServizioNonRaggiunto(messaggio, "grande")

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
        /** Fase 3 (§14.1): il segmento Da approvare, Segna rimborsato, la regola delle approvazioni. */
        val interfaccia: Interfaccia = Interfaccia(),
    )

    // ------------------------------------------------------------- accesso

    /** Entra con email e password: il token si salva sul telefono e vale finché non si esce. */
    suspend fun accedi(email: String, password: String): Accesso = withContext(Dispatchers.IO) {
        if (base().isBlank() && google().isBlank()) throw Rifiutato("Scrivi l'indirizzo del server")
        val corpo = JSONObject().put("azione", "accedi").put("email", email.trim()).put("password", password)
        chiSono().forEach { (k, v) -> corpo.put(k, v) }
        // Senza token la firma di casa non si controlla: se c'è Google, accedi passa da lì (§8.2).
        val r = verifica(strade.scrivi(corpo, conToken = false))
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
            interfaccia = Interfaccia.daJson(i),
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
        leggi("rapportini", lunga = true)
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
        idSpesa: String = "",
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
        if (idSpesa.isNotBlank()) corpo.put("idSpesa", idJson(idSpesa))
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
    suspend fun creaCommessa(m: Commessa, cliente: Cliente? = null, costi: Boolean = true, fatturazione: Boolean = false): Salvataggio<Commessa> = withContext(Dispatchers.IO) {
        val corpo = campiCommessa(m, cliente, nuova = true, costi = costi, fatturazione = fatturazione).put("azione", "creaCommessa").put("id", m.id.trim().uppercase())
        val o = scrivi(corpo).optJSONObject("commessa") ?: throw Rifiutato("Il server non ha restituito la commessa")
        Salvataggio(Commessa.daJson(o), o.optBoolean("giaEsisteva", false))
    }

    /** Riscrive la commessa [Commessa.id], stato compreso (APERTA, SOSPESA, CHIUSA). */
    suspend fun aggiornaCommessa(m: Commessa, cliente: Cliente? = null, costi: Boolean = true, fatturazione: Boolean = false): Commessa = withContext(Dispatchers.IO) {
        val r = scrivi(
            JSONObject().put("azione", "aggiornaCommessa").put("id", m.id.trim())
                .put("campi", campiCommessa(m, cliente, nuova = false, costi = costi, fatturazione = fatturazione))
        )
        Commessa.daJson(r.optJSONObject("commessa") ?: throw Rifiutato("Il server non ha restituito la commessa"))
    }

    private fun campiCommessa(m: Commessa, cliente: Cliente?, nuova: Boolean, costi: Boolean, fatturazione: Boolean = false): JSONObject {
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
            // Fase 4, come pc/ui/commesse.js: "come si fattura" solo con la fatturazione, e solo se si sa.
            if (fatturazione && m.modoFatturazione != null) o.put("modoFatturazione", m.modoFatturazione)
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
     * copiato da Drive). Via Google gli stessi codici arrivano nel campo `stato`;
     * oltre 25 MB il file si apre solo dall'ufficio ([SoloInUfficio]).
     */
    override suspend fun file(id: String): Pair<ByteArray, String> = withContext(Dispatchers.IO) {
        controllaConfigurazione()
        strade.file(id, chiSono())
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
    suspend fun salvaSoggetto(s: Cliente, nuovo: Boolean, costi: Boolean, fatturazione: Boolean = false): Salvataggio<Cliente> = withContext(Dispatchers.IO) {
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
            // Fase 4, come pc/ui/clienti.js: solo per un cliente, solo con la fatturazione, e solo se letti
            // (null = automatico / quello delle impostazioni). Senza, il server li lascia com'erano.
            if (fatturazione && s.cliente && s.fatturazioneLetta) {
                o.put("sostitutoImposta", s.sostitutoImposta ?: JSONObject.NULL)
                    .put("pagamentoGiorni", s.pagamentoGiorni ?: JSONObject.NULL)
                    .put("pagamentoFineMese", s.pagamentoFineMese ?: JSONObject.NULL)
            }
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
        val r = leggi("controllaPartitaIva", "partitaIva" to partitaIva.trim(), "nazione" to nazione, lunga = true)
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
        // Fase 5 (§16.2): i dati dell'impianto.
        if (x.impianto) {
            o.put("categoria", x.categoria).put("matricola", x.matricola.trim()).put("potenza", x.potenza.trim())
                .put("tensione", x.tensione.trim()).put("messaInServizio", x.messaInServizio.trim()).put("ambiente", x.ambiente)
                .put("datiTecnici", x.datiTecnici.trim())
                .put("referenteId", x.referenteId.takeIf { it.isNotBlank() }?.let(::idJson) ?: JSONObject.NULL)
                .put("sedePadreId", x.sedePadreId.takeIf { it.isNotBlank() }?.let(::idJson) ?: JSONObject.NULL)
        }
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
    suspend fun esporta(cosa: String, filtro: FiltroRegistro? = null, altri: List<Pair<String, String>> = emptyList()): Triple<String, String, ByteArray> = withContext(Dispatchers.IO) {
        val parametri = buildList {
            add("cosa" to cosa)
            addAll(altri)
            if (cosa == "registro" && filtro != null) addAll(parametriRegistro(filtro))
            if (cosa == "rapportini") add("tutti" to "1")
        }
        val r = leggi("esporta", *parametri.toTypedArray(), lunga = true)
        val byte = try {
            Base64.getMimeDecoder().decode(r.testo("base64"))
        } catch (_: IllegalArgumentException) {
            throw Rifiutato("Il file arrivato dal server non si legge")
        }
        Triple(r.testo("nome").ifBlank { "wisper-$cosa.csv" }, r.testo("mime").ifBlank { "text/csv" }, byte)
    }

    suspend fun copie(): StatoCopie = withContext(Dispatchers.IO) { StatoCopie.daJson(leggi("copie")) }

    suspend fun copiaAdesso(): CopiaSicurezza = withContext(Dispatchers.IO) {
        controllaConfigurazione()
        val r = verifica(strade.scrivi(conChi(JSONObject().put("azione", "copiaAdesso")), lunga = true))
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

    // ------------------------------------------------------------- fase 3: ore, timer, approvazioni (architettura.md §14)

    /** Le righe di ore del periodo (di base la settimana di oggi); [utente] = di chi (il collaboratore vede sempre e solo le sue). */
    suspend fun ore(da: LocalDate? = null, a: LocalDate? = null, utente: String = "", commessa: String = "", stato: String = ""): ElencoOre =
        withContext(Dispatchers.IO) {
            val p = buildList {
                da?.let { add("da" to it.toString()) }
                a?.let { add("a" to it.toString()) }
                if (utente.isNotBlank()) add("utente" to utente)
                if (commessa.isNotBlank()) add("commessa" to commessa)
                if (stato.isNotBlank()) add("stato" to stato)
            }
            ElencoOre.daJson(leggi("ore", *p.toTypedArray()))
        }

    /** salvaOre {riga}: senza id crea, con id cambia solo i campi mandati. Torna la riga come l'ha scritta il server. */
    suspend fun salvaOre(riga: JSONObject): RigaOre = withContext(Dispatchers.IO) {
        RigaOre.daJson(scrivi(JSONObject().put("azione", "salvaOre").put("riga", riga)).optJSONObject("riga") ?: throw Rifiutato("Il server non ha restituito le ore"))
    }

    /**
     * salvaOre dalla coda: con l'idLocale nel corpo il server non crea doppioni.
     * giaEsisteva = la riga c'era gia' (`giaArrivata`): torna quella, senza le modifiche mandate.
     */
    suspend fun salvaOreDallaCoda(riga: JSONObject): Salvataggio<RigaOre> = withContext(Dispatchers.IO) {
        val r = scrivi(JSONObject().put("azione", "salvaOre").put("riga", riga))
        Salvataggio(RigaOre.daJson(r.optJSONObject("riga") ?: throw Rifiutato("Il server non ha restituito le ore")), r.vero("giaArrivata"))
    }

    /** Toglie (o, con [annulla], rimette) una riga di ore: non si cancella niente. */
    suspend fun togliOre(id: String, annulla: Boolean = false): RigaOre = withContext(Dispatchers.IO) {
        val corpo = JSONObject().put("azione", "togliOre").put("id", idJson(id))
        if (annulla) corpo.put("annulla", true)
        RigaOre.daJson(scrivi(corpo).optJSONObject("riga") ?: throw Rifiutato("Il server non ha restituito le ore"))
    }

    /** Il proprio timer; [oraMs] è il contatore del telefono, per far scorrere i secondi da lì. */
    suspend fun timer(oraMs: Long = System.currentTimeMillis()): TimerLetto = withContext(Dispatchers.IO) { TimerLetto.daJson(leggi("timer"), oraMs) }

    suspend fun avviaTimer(idCommessa: String, descrizione: String = "", fatturabile: Boolean? = null, oraMs: Long = System.currentTimeMillis()): TimerLetto =
        withContext(Dispatchers.IO) {
            val corpo = JSONObject().put("azione", "avviaTimer").put("idCommessa", idCommessa).put("descrizione", descrizione.trim())
            if (fatturabile != null) corpo.put("fatturabile", fatturabile)
            TimerLetto.daJson(scrivi(corpo), oraMs)
        }

    /** La riga di ore in bozza, dal momento in cui il timer è partito ad adesso, da correggere. */
    suspend fun fermaTimer(): TimerFermato = withContext(Dispatchers.IO) {
        val r = scrivi(JSONObject().put("azione", "fermaTimer"))
        TimerFermato(RigaOre.daJson(r.optJSONObject("riga") ?: throw Rifiutato("Il server non ha restituito la bozza delle ore")), r.testo("avviso"))
    }

    /** Chi approva: ore, rapportini, spese e trasferte in attesa, per persona, con le anomalie. */
    suspend fun daApprovare(): DaApprovare = withContext(Dispatchers.IO) { DaApprovare.daJson(leggi("daApprovare")) }

    suspend fun approva(voci: List<VoceDaApprovare>): EsitoApprovazione = decidi("approva", voci, "")
    suspend fun respingi(voci: List<VoceDaApprovare>, motivo: String): EsitoApprovazione = decidi("respingi", voci, motivo)
    suspend fun annullaApprovazione(voci: List<VoceDaApprovare>): EsitoApprovazione = decidi("annullaApprovazione", voci, "")

    private suspend fun decidi(azione: String, voci: List<VoceDaApprovare>, motivo: String): EsitoApprovazione = withContext(Dispatchers.IO) {
        val corpo = JSONObject().put("azione", azione).put("voci", JSONArray().apply { voci.forEach { put(it.perServer()) } })
        if (azione == "respingi") corpo.put("motivo", motivo.trim())
        EsitoApprovazione.daJson(scrivi(corpo))
    }

    // ------------------------------------------------------------- fase 3: spese, trasferte, rimborsi, veicoli

    /** Le spese del periodo (di base il mese di oggi), le più recenti prima. */
    suspend fun spese(da: LocalDate? = null, a: LocalDate? = null, utente: String = "", idTrasferta: String = ""): ElencoSpese = withContext(Dispatchers.IO) {
        val p = buildList {
            da?.let { add("da" to it.toString()) }
            a?.let { add("a" to it.toString()) }
            if (utente.isNotBlank()) add("utente" to utente)
            if (idTrasferta.isNotBlank()) add("idTrasferta" to idTrasferta)
        }
        ElencoSpese.daJson(leggi("spese", *p.toTypedArray()))
    }

    suspend fun salvaSpesa(spesa: JSONObject): Spesa = withContext(Dispatchers.IO) {
        Spesa.daJson(scrivi(JSONObject().put("azione", "salvaSpesa").put("spesa", spesa)).optJSONObject("spesa") ?: throw Rifiutato("Il server non ha restituito la spesa"))
    }

    /** Lo scontrino della spesa [idSpesa]. [idFile] uguale a ogni tentativo: il server non crea doppioni. */
    suspend fun caricaFotoSpesa(idSpesa: String, idFile: String, file: File, mime: String = "image/jpeg"): FileRemoto = withContext(Dispatchers.IO) {
        caricaFile("spesa", file.readBytes(), mime, idFile = idFile, idSpesa = idSpesa)
    }

    suspend fun togliSpesa(id: String, annulla: Boolean = false): Spesa = withContext(Dispatchers.IO) {
        val corpo = JSONObject().put("azione", "togliSpesa").put("id", idJson(id))
        if (annulla) corpo.put("annulla", true)
        Spesa.daJson(scrivi(corpo).optJSONObject("spesa") ?: throw Rifiutato("Il server non ha restituito la spesa"))
    }

    suspend fun trasferte(da: LocalDate? = null, a: LocalDate? = null, utente: String = ""): ElencoTrasferte = withContext(Dispatchers.IO) {
        val p = buildList {
            da?.let { add("da" to it.toString()) }
            a?.let { add("a" to it.toString()) }
            if (utente.isNotBlank()) add("utente" to utente)
        }
        ElencoTrasferte.daJson(leggi("trasferte", *p.toTypedArray()))
    }

    suspend fun salvaTrasferta(t: JSONObject): Trasferta = withContext(Dispatchers.IO) {
        Trasferta.daJson(scrivi(JSONObject().put("azione", "salvaTrasferta").put("trasferta", t)).optJSONObject("trasferta") ?: throw Rifiutato("Il server non ha restituito la trasferta"))
    }

    suspend fun togliTrasferta(id: String, annulla: Boolean = false): Trasferta = withContext(Dispatchers.IO) {
        val corpo = JSONObject().put("azione", "togliTrasferta").put("id", idJson(id))
        if (annulla) corpo.put("annulla", true)
        Trasferta.daJson(scrivi(corpo).optJSONObject("trasferta") ?: throw Rifiutato("Il server non ha restituito la trasferta"))
    }

    /** Cosa va restituito a chi (il collaboratore riceve solo la sua scheda). */
    suspend fun rimborsi(utente: String = ""): Rimborsi = withContext(Dispatchers.IO) {
        Rimborsi.daJson(if (utente.isNotBlank()) leggi("rimborsi", "utente" to utente) else leggi("rimborsi"))
    }

    /** Segna rimborsate (o, con [annulla], toglie il "rimborsato") le voci date. Torna quante e quanto. */
    suspend fun segnaRimborsato(voci: List<VoceRimborso>, annulla: Boolean = false): Pair<Int, Double> = withContext(Dispatchers.IO) {
        val corpo = JSONObject().put("azione", "segnaRimborsato").put("voci", JSONArray().apply { voci.forEach { put(it.perServer()) } })
        if (annulla) corpo.put("annulla", true)
        val r = scrivi(corpo)
        r.optInt("fatte") to (r.numero("totale") ?: 0.0)
    }

    suspend fun veicoli(tutti: Boolean = false): ElencoVeicoli = withContext(Dispatchers.IO) {
        ElencoVeicoli.daJson(if (tutti) leggi("veicoli", "tutti" to "1") else leggi("veicoli"))
    }

    suspend fun salvaVeicolo(v: Veicolo): Veicolo = withContext(Dispatchers.IO) {
        Veicolo.daJson(scrivi(JSONObject().put("azione", "salvaVeicolo").put("veicolo", v.perSalvare())).optJSONObject("veicolo") ?: throw Rifiutato("Il server non ha restituito il veicolo"))
    }

    /** Lo scontrino [idFile] della spesa va nel cestino (da cui si recupera). Torna la spesa senza. */
    suspend fun togliFotoSpesa(idFile: String): Spesa = withContext(Dispatchers.IO) {
        Spesa.daJson(scrivi(JSONObject().put("azione", "togliFotoSpesa").put("id", idFile)).optJSONObject("spesa") ?: throw Rifiutato("Il server non ha restituito la spesa"))
    }

    /** Le ore per persona o per commessa (§14.11): ore, fatturabili, percentuale, costo (solo coi soldi). */
    suspend fun statisticheOre(da: LocalDate, a: LocalDate, per: String): StatisticheOre = withContext(Dispatchers.IO) {
        StatisticheOre.daJson(leggi("statisticheOre", "da" to da.toString(), "a" to a.toString(), "per" to per))
    }

    /** [per]: "persona", "commessa" o "categoria". */
    suspend fun riepilogoSpese(da: LocalDate, a: LocalDate, per: String): RiepilogoSpese = withContext(Dispatchers.IO) {
        RiepilogoSpese.daJson(leggi("riepilogoSpese", "da" to da.toString(), "a" to a.toString(), "per" to per))
    }

    // ------------------------------------------------------------- fase 4 (architettura.md §15): le azioni le scrive Fase4

    /** Una lettura della fase 4: GET /exec?azione=... Le risposte grandi (fatture, scadenziario) aspettano di più. */
    override suspend fun leggiAzione(azione: String, parametri: List<Pair<String, String>>): JSONObject = withContext(Dispatchers.IO) {
        leggi(azione, *parametri.toTypedArray(), lunga = true)
    }

    /** Una scrittura della fase 4: POST, mai ripetuta da sola. */
    override suspend fun scriviAzione(corpo: JSONObject): JSONObject = withContext(Dispatchers.IO) { scrivi(corpo) }

    /**
     * Fase 5 (§16.3): un file in byte con `POST /carica`, senza base64. [idFile] è lo
     * stesso a ogni tentativo: il server riconosce il file già arrivato. [per] è
     * "documento" o "ticket". La risposta è come /exec (`ok`, `errore`, `gia`).
     */
    override suspend fun carica(nome: String, mime: String, idFile: String, per: String, dati: ByteArray): JSONObject = withContext(Dispatchers.IO) {
        controllaConfigurazione()
        if (dati.isEmpty()) throw Rifiutato("File vuoto")
        verifica(strade.carica(listOf("nome" to nome, "mime" to mime, "idFile" to idFile, "per" to per), dati, chiSono()))
    }

    // ------------------------------------------------------------- interno

    /** L'indirizzo di casa, senza la barra e senza /exec in fondo. */
    private fun base(): String = Strade.base(indirizzo())

    /** GET /exec?azione=...: [lunga] per le risposte grandi (tutti i rapportini, le esportazioni). */
    private fun leggi(azione: String, vararg parametri: Pair<String, String>, lunga: Boolean = false): JSONObject {
        controllaConfigurazione()
        val p = buildList {
            add("azione" to azione)
            addAll(chiSono().toList())
            addAll(parametri)
        }
        return verifica(strade.leggi(p, lunga))
    }

    private fun scrivi(corpo: JSONObject): JSONObject {
        controllaConfigurazione()
        return verifica(strade.scrivi(conChi(corpo)))
    }

    /** Chi chiama nel corpo delle scritture (se non c'è già). */
    private fun conChi(corpo: JSONObject): JSONObject {
        chiSono().forEach { (k, v) -> if (!corpo.has(k)) corpo.put(k, v) }
        return corpo
    }

    /** Senza indirizzo o senza token non si parte: non è un no del server, si aspetta l'accesso. */
    private fun controllaConfigurazione() {
        if (base().isBlank() && google().isBlank()) throw AccessoScaduto("Manca l'indirizzo del server: entra di nuovo")
        if (token().isBlank()) throw AccessoScaduto("Entra in Wisper per continuare")
    }

    /** La risposta del server, da una strada o dall'altra: ok, o l'errore giusto per la coda. */
    private fun verifica(json: JSONObject): JSONObject {
        if (!json.optBoolean("ok")) {
            val errore = json.optString("errore").ifBlank { "Errore sconosciuto" }
            when {
                json.has("accesso") && !json.optBoolean("accesso", true) -> throw AccessoScaduto(errore)
                json.has("permesso") && !json.optBoolean("permesso", true) -> throw PermessoNegato(errore)
                json.optBoolean("rete", false) -> throw ServizioNonRaggiunto(errore, json.optString("porta"))
                json.optBoolean("serveConferma", false) -> throw DaConfermare(errore, json)
                else -> throw Rifiutato(errore)
            }
        }
        return json
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
