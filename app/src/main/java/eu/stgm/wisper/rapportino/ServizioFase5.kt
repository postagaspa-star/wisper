package eu.stgm.wisper.rapportino

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.time.LocalDate
import java.time.LocalDateTime
import java.util.Base64
import java.util.UUID

/** La fase 5 parla come la 4, più i file in byte di `POST /carica` (§16.3). */
interface TrasportoFase5 : TrasportoFase4 {
    suspend fun carica(nome: String, mime: String, idFile: String, per: String, dati: ByteArray): JSONObject
}

/**
 * Le azioni della fase 5 (architettura.md §16), coi nomi esatti del server. Lanciano
 * le eccezioni di [PonteServer]; [ServizioFase5] le fa diventare Result. Gli id dei
 * ticket possono essere l'id interno, il numero o l'idLocale di uno nato senza rete.
 */
class Fase5(private val t: TrasportoFase5) {

    private fun corpo(azione: String) = JSONObject().put("azione", azione)
    private fun idJson(id: String): Any = PonteServer.idJson(id)

    private fun conTicket(r: JSONObject): Ticket = Ticket.daJson(r.optJSONObject("ticket") ?: throw PonteServer.Rifiutato("Il server non ha restituito il ticket"))
    private fun conDocumento(r: JSONObject): DocArchivio = DocArchivio.daJson(r.optJSONObject("documento") ?: throw PonteServer.Rifiutato("Il server non ha restituito il documento"))
    private fun conContratto(r: JSONObject): Contratto = Contratto.daJson(r.optJSONObject("contratto") ?: throw PonteServer.Rifiutato("Il server non ha restituito il contratto"))
    private fun conScadenza(r: JSONObject): Scadenza = Scadenza.daJson(r.optJSONObject("scadenza") ?: throw PonteServer.Rifiutato("Il server non ha restituito la scadenza"))

    // -------------------------------------------------- ticket (§16.11-16.14)

    suspend fun tickets(segmento: String = "aperti", altri: List<Pair<String, String>> = emptyList()): ElencoTicket =
        ElencoTicket.daJson(t.leggiAzione("tickets", listOf("segmento" to segmento) + altri))

    suspend fun ticket(id: String): Ticket = conTicket(t.leggiAzione("ticket", listOf("id" to id)))

    /** salvaTicket {ticket}: nuovo (con l'idLocale, anche ripetuto = lo stesso) o cambiato (con l'id). */
    suspend fun salvaTicket(ticket: JSONObject): Ticket = conTicket(t.scriviAzione(corpo("salvaTicket").put("ticket", ticket)))

    /** prendiTicket, assegnaTicket, sospendiTicket, riprendiTicket, altroIntervento, risolviTicket, riapriTicket, annullaTicket. */
    suspend fun azione(azione: String, id: String, campi: JSONObject = JSONObject()): Ticket {
        val c = corpo(azione).put("id", idJson(id))
        campi.keys().forEach { k -> if (k != "azione" && k != "id") c.put(k, campi.get(k)) }
        return conTicket(t.scriviAzione(c))
    }

    suspend fun pianificaTicket(id: String, inizio: LocalDateTime, fine: LocalDateTime?, assegnataA: String, luogo: String, note: String, conferma: Boolean): Pair<Ticket, Attivita?> {
        val c = corpo("pianificaTicket").put("id", idJson(id)).put("inizio", inizio.format(Attivita.ISTANTE))
        if (fine != null) c.put("fine", fine.format(Attivita.ISTANTE))
        if (assegnataA.isNotBlank()) c.put("assegnataA", idJson(assegnataA))
        if (luogo.isNotBlank()) c.put("luogo", luogo.trim())
        if (note.isNotBlank()) c.put("note", note.trim())
        if (conferma) c.put("conferma", true)
        val r = t.scriviAzione(c)
        return conTicket(r) to r.optJSONObject("attivita")?.let(Attivita::daJson)
    }

    /** Torna il ticket chiuso e la voce che va in Da fatturare (null per gli altri modi). */
    suspend fun chiudiTicket(id: String, fatturazione: String, prezzoCorpo: Double?, motivo: String, conferma: Boolean): Pair<Ticket, JSONObject?> {
        val c = corpo("chiudiTicket").put("id", idJson(id)).put("fatturazione", fatturazione)
        if (prezzoCorpo != null) c.put("prezzoCorpo", prezzoCorpo)
        if (motivo.isNotBlank()) c.put("motivo", motivo.trim())
        if (conferma) c.put("conferma", true)
        val r = t.scriviAzione(c)
        return conTicket(r) to r.optJSONObject("daFatturare")
    }

    suspend fun legaRapportino(idRapportino: String, idTicket: String?): Rapportino {
        val r = t.scriviAzione(corpo("legaRapportino").put("idRapportino", idRapportino).put("idTicket", idTicket?.let(::idJson) ?: JSONObject.NULL))
        return Rapportino.daJson(r.optJSONObject("rapportino") ?: throw PonteServer.Rifiutato("Il server non ha restituito il rapportino"), dalFoglio = true)
    }

    /** caricaFile {tipo: "ticket"} in base64 (come le foto dei rapportini), con lo stesso [idFile] a ogni tentativo. */
    suspend fun caricaFotoTicket(idTicket: String, dati: ByteArray, mime: String, nome: String, idFile: String): FotoTicket {
        val c = corpo("caricaFile").put("tipo", "ticket").put("idTicket", idJson(idTicket)).put("mime", mime).put("nome", nome)
            .put("idFile", idFile).put("base64", Base64.getEncoder().encodeToString(dati))
        return FotoTicket.daJson(t.scriviAzione(c).optJSONObject("file") ?: throw PonteServer.Rifiutato("Il server non ha salvato la foto"))
    }

    suspend fun togliFotoTicket(id: String, annulla: Boolean = false): Ticket {
        val c = corpo("togliFotoTicket").put("id", id)
        if (annulla) c.put("annulla", true)
        return conTicket(t.scriviAzione(c))
    }

    suspend fun storicoImpianto(idSede: String, pagina: Int = 1): StoricoImpianto =
        StoricoImpianto.daJson(t.leggiAzione("storicoImpianto", buildList { add("idSede" to idSede); if (pagina > 1) add("pagina" to pagina.toString()) }))

    suspend fun statisticheTicket(da: LocalDate?, a: LocalDate?, per: String): StatisticheTicket =
        StatisticheTicket.daJson(t.leggiAzione("statisticheTicket", buildList {
            da?.let { add("da" to it.toString()) }; a?.let { add("a" to it.toString()) }; add("per" to per)
        }))

    // -------------------------------------------------- contratti (§16.15-16.16)

    suspend fun contratti(stato: String = "", idCliente: String = "", testo: String = ""): List<Contratto> =
        t.leggiAzione("contratti", buildList {
            if (stato.isNotBlank()) add("stato" to stato); if (idCliente.isNotBlank()) add("idCliente" to idCliente); if (testo.isNotBlank()) add("testo" to testo)
        }).optJSONArray("contratti").oggetti().map(Contratto::daJson)

    suspend fun contratto(id: String): Contratto = conContratto(t.leggiAzione("contratto", listOf("id" to id)))
    suspend fun salvaContratto(c: JSONObject): Contratto = conContratto(t.scriviAzione(corpo("salvaContratto").put("contratto", c)))
    suspend fun attivaContratto(id: String): Contratto = conContratto(t.scriviAzione(corpo("attivaContratto").put("id", idJson(id))))

    suspend fun rinnovaContratto(id: String, al: LocalDate?, canone: Double?, fatturazioneCanone: String?): Contratto {
        val c = corpo("rinnovaContratto").put("id", idJson(id))
        al?.let { c.put("al", it.toString()) }; canone?.let { c.put("canone", it) }; fatturazioneCanone?.let { c.put("fatturazioneCanone", it) }
        return conContratto(t.scriviAzione(c))
    }

    suspend fun disdiciContratto(id: String, data: LocalDate?, motivo: String): Contratto {
        val c = corpo("disdiciContratto").put("id", idJson(id)).put("motivo", motivo.trim())
        data?.let { c.put("data", it.toString()) }
        return conContratto(t.scriviAzione(c))
    }

    suspend fun chiudiContratto(id: String, conferma: Boolean): Contratto {
        val c = corpo("chiudiContratto").put("id", idJson(id))
        if (conferma) c.put("conferma", true)
        return conContratto(t.scriviAzione(c))
    }

    // -------------------------------------------------- documenti (§16.3-16.8)

    suspend fun documenti(f: FiltroArchivio): ElencoArchivio = ElencoArchivio.daJson(t.leggiAzione("documenti", f.parametri()))
    suspend fun documento(id: String): DocArchivio = conDocumento(t.leggiAzione("documento", listOf("id" to id)))

    /** Torna il documento e, per un verbale nuovo, la scadenza che potrebbe chiudere. */
    suspend fun salvaDocumento(d: JSONObject): Pair<DocArchivio, Scadenza?> {
        val r = t.scriviAzione(corpo("salvaDocumento").put("documento", d))
        return conDocumento(r) to r.optJSONObject("chiudeScadenza")?.let(Scadenza::daJson)
    }

    suspend fun caricaVersione(id: String, idFile: String, nota: String): DocArchivio =
        conDocumento(t.scriviAzione(corpo("caricaVersione").put("id", idJson(id)).put("idFile", idFile).put("nota", nota.trim())))

    suspend fun approvaVersione(idVersione: String): DocArchivio = conDocumento(t.scriviAzione(corpo("approvaVersione").put("id", idJson(idVersione))))
    suspend fun respingiVersione(idVersione: String, motivo: String): DocArchivio = conDocumento(t.scriviAzione(corpo("respingiVersione").put("id", idJson(idVersione)).put("motivo", motivo.trim())))
    suspend fun annullaDecisione(idVersione: String): DocArchivio = conDocumento(t.scriviAzione(corpo("annullaDecisione").put("id", idJson(idVersione))))

    suspend fun togliVersione(idVersione: String, annulla: Boolean = false): DocArchivio {
        val c = corpo("togliVersione").put("id", idJson(idVersione))
        if (annulla) c.put("annulla", true)
        return conDocumento(t.scriviAzione(c))
    }

    suspend fun archiviaDocumento(id: String, archiviato: Boolean, togliScadenza: Boolean? = null): DocArchivio {
        val c = corpo("archiviaDocumento").put("id", idJson(id)).put("archiviato", archiviato)
        togliScadenza?.let { c.put("togliScadenza", it) }
        return conDocumento(t.scriviAzione(c))
    }

    suspend fun inviaDocumento(id: String, idVersione: String, a: String, cc: String, oggetto: String, messaggio: String) {
        val c = corpo("inviaDocumento").put("id", idJson(id)).put("a", a.trim()).put("cc", cc.trim()).put("oggetto", oggetto).put("messaggio", messaggio)
        if (idVersione.isNotBlank()) c.put("idVersione", idJson(idVersione))
        t.scriviAzione(c)
    }

    /** Il link che scade (§16.7): finché non è collegato il server dice di no, con la sua frase. */
    suspend fun condividiDocumento(id: String, perChi: String, giorni: Int?): String {
        val c = corpo("condividiDocumento").put("id", idJson(id)).put("perChi", perChi.trim())
        giorni?.let { c.put("giorni", it) }
        return t.scriviAzione(c).testo("link")
    }

    suspend fun revocaCondivisione(id: String): DocArchivio = conDocumento(t.scriviAzione(corpo("revocaCondivisione").put("id", idJson(id))))

    suspend fun categorie(): List<CategoriaDoc> = t.leggiAzione("categorieDocumenti").optJSONArray("categorie").oggetti().map(CategoriaDoc::daJson)

    suspend fun salvaCategoria(c: JSONObject): List<CategoriaDoc> =
        t.scriviAzione(corpo("salvaCategoria").put("categoria", c)).optJSONArray("categorie").oggetti().map(CategoriaDoc::daJson)

    suspend fun modelli(): Modelli = Modelli.daJson(t.leggiAzione("modelli"))
    suspend fun salvaTestoModello(chiave: String, testo: String): Modelli = Modelli.daJson(t.scriviAzione(corpo("salvaTestoModello").put("chiave", chiave).put("testo", testo)))

    suspend fun componiModello(chiave: String, ids: Map<String, String>): ModelloComposto =
        ModelloComposto.daJson(t.leggiAzione("componiModello", listOf("chiave" to chiave) + ids.filterValues { it.isNotBlank() }.toList()))

    suspend fun spazio(): Spazio = Spazio.daJson(t.leggiAzione("spazio"))

    /** Senza [conferma] il server chiede (DaConfermare, con la frase); con, toglie. Torna quanti e quanti MB. */
    suspend fun svuotaCestino(conferma: Boolean): Pair<Int, Double> {
        val r = t.scriviAzione(corpo("svuotaCestino").put("conferma", conferma))
        return r.optInt("tolti") to (r.numero("mb") ?: 0.0)
    }

    /** POST /carica: torna il file caricato (e il documento che lo ha già, se c'è). */
    suspend fun carica(nome: String, mime: String, idFile: String, per: String, dati: ByteArray): FileCaricato =
        FileCaricato.daJson(t.carica(nome, mime, idFile, per, dati))

    // -------------------------------------------------- scadenze (§16.10)

    suspend fun scadenze(altri: List<Pair<String, String>> = emptyList()): ElencoScadenze = ElencoScadenze.daJson(t.leggiAzione("scadenze", altri))
    suspend fun salvaScadenza(s: JSONObject): Scadenza = conScadenza(t.scriviAzione(corpo("salvaScadenza").put("scadenza", s)))

    /** Torna la scadenza fatta e la prossima, se si ripete. */
    suspend fun faiScadenza(id: String, data: LocalDate?, idDocumento: String = ""): Pair<Scadenza, Scadenza?> {
        val c = corpo("faiScadenza").put("id", idJson(id))
        data?.let { c.put("data", it.toString()) }
        if (idDocumento.isNotBlank()) c.put("idDocumento", idJson(idDocumento))
        val r = t.scriviAzione(c)
        return conScadenza(r) to r.optJSONObject("prossima")?.let(Scadenza::daJson)
    }

    suspend fun togliScadenza(id: String, motivo: String, ancheProssime: Boolean): Scadenza =
        conScadenza(t.scriviAzione(corpo("togliScadenza").put("id", idJson(id)).put("motivo", motivo.trim()).put("ancheProssime", ancheProssime)))

    /** Il CSV per Excel (§16.20): nome e byte. */
    suspend fun esporta(cosa: String, parametri: List<Pair<String, String>> = emptyList()): Pair<String, ByteArray> {
        val r = t.leggiAzione("esporta", listOf("cosa" to cosa) + parametri)
        val byte = try {
            Base64.getMimeDecoder().decode(r.testo("base64"))
        } catch (_: IllegalArgumentException) {
            throw PonteServer.Rifiutato("Il file arrivato dal server non si legge")
        }
        return r.testo("nome").ifBlank { "wisper-$cosa.csv" } to byte
    }
}

/**
 * Quello che si fa anche senza rete (fase5.md §3.9): va nella coda su disco e parte
 * da solo. Lo fa Archivio con la sua coda; nella visita guidata non fa niente.
 */
interface CodaFase5 {
    fun ticket(chiave: String, corpo: JSONObject)
    fun azioneTicket(chiave: String, corpo: JSONObject)
    fun fotoTicket(chiave: String, file: File)
    fun faiScadenza(id: String, corpo: JSONObject)
}

/**
 * Come partono dalla coda le cose della fase 5. SENZA DOPPIONI: il ticket nato qui
 * parte col suo idLocale (ripetuto, il server torna lo stesso con giaArrivato), le
 * azioni di stato ripetute uguali tornano ok senza rifare niente, la foto ha lo
 * stesso idFile, la scadenza fatta ripetuta non rifà la prossima (§16.1). Le azioni
 * col ticket usano la sua chiave: id, numero o idLocale vanno tutti bene.
 */
class InvioFase5(private val f: Fase5) {
    suspend fun esegui(op: CodaInvii.Operazione) {
        when (op.tipo) {
            CodaInvii.Tipo.TICKET -> f.salvaTicket(op.corpoJson().put("idLocale", op.idLocale))
            CodaInvii.Tipo.AZIONE_TICKET -> {
                val c = op.corpoJson()
                f.azione(c.testo("azione"), op.idLocale, c)
            }
            CodaInvii.Tipo.FOTO_TICKET -> {
                val file = File(op.percorso)
                if (!file.exists()) throw PonteServer.Rifiutato("La foto non è più sul telefono")
                f.caricaFotoTicket(op.idLocale, file.readBytes(), "image/jpeg", "", op.idFile)
            }
            CodaInvii.Tipo.FAI_SCADENZA -> {
                val c = op.corpoJson()
                f.faiScadenza(op.idLocale.removePrefix("scadenza:"), c.data("data"), c.testo("idDocumento"))
            }
            else -> throw IllegalArgumentException("Non è un'operazione della fase 5: ${op.tipo}")
        }
    }
}

/** Le copie sul telefono delle ultime letture (per leggere senza rete): JSON per nome, scritti interi. */
class Scaffale(private val cartella: File?, private val prefisso: String = "f5-") {
    private val memoria = HashMap<String, JSONObject>()

    private fun file(nome: String) = File(cartella, prefisso + nome.replace(Regex("""[^A-Za-z0-9._-]"""), "_") + ".json")

    @Synchronized
    fun leggi(nome: String): JSONObject? {
        memoria[nome]?.let { return it }
        val c = cartella ?: return null
        val f = file(nome)
        if (!c.exists() || !f.exists()) return null
        return runCatching { JSONObject(f.readText()) }.getOrNull()?.also { memoria[nome] = it }
    }

    @Synchronized
    fun scrivi(nome: String, o: JSONObject) {
        memoria[nome] = o
        val c = cartella ?: return
        runCatching {
            c.mkdirs()
            val f = file(nome)
            val tmp = File(c, f.name + ".tmp")
            tmp.writeText(o.toString())
            if (!tmp.renameTo(f)) { f.delete(); tmp.renameTo(f) }
        }
    }

    @Synchronized
    fun svuota() {
        memoria.clear()
        cartella?.listFiles()?.filter { it.name.startsWith(prefisso) }?.forEach { it.delete() }
    }

    /** Toglie una copia sola (dal telefono e dalla memoria). */
    @Synchronized
    fun togli(nome: String) {
        memoria.remove(nome)
        cartella?.let { File(it, file(nome).name).delete() }
    }

    /** I nomi delle copie che ci sono sul disco (per le prove della privacy). */
    @Synchronized
    fun nomiSulDisco(): List<String> = cartella?.listFiles()?.filter { it.name.startsWith(prefisso) && it.name.endsWith(".json") }?.map { it.name }.orEmpty()
}

/**
 * Quello che le schermate della fase 5 chiamano: le azioni di [Fase5] come Result,
 * le letture che restano sul telefono (per leggere senza rete, "letto alle 16:52"),
 * la coda per quello che si fa anche senza rete, i documenti tenuti sul telefono.
 *
 * @param cartellaFile cacheDir: i PDF e i file da aprire o condividere (cacheDir/pdf), i documenti aperti di recente.
 * @param tenuti filesDir/documenti: i documenti tenuti sul telefono (fino a 300 MB).
 */
class ServizioFase5(
    trasporto: TrasportoFase5,
    private val cartellaFile: File?,
    private val tenuti: File?,
    val scaffale: Scaffale,
    private val esecutore: EsecutoreFase4,
    private val coda: CodaFase5,
    private val dopoScrittura: () -> Unit = {},
) {
    val f = Fase5(trasporto)
    private val t = trasporto

    private suspend fun <T> leggi(lavoro: suspend Fase5.() -> T): Result<T> = esecutore.esegui { f.lavoro() }
    private suspend fun <T> scrivi(lavoro: suspend Fase5.() -> T): Result<T> = esecutore.esegui { f.lavoro() }.also { if (it.isSuccess) dopoScrittura() }

    /** L'elenco dei ticket aperti letto per ultimo (resta anche senza rete). */
    private val _aperti = MutableStateFlow(scaffale.leggi("tickets-aperti")?.let { runCatching { ElencoTicket.daJson(it) }.getOrNull() })
    val aperti: StateFlow<ElencoTicket?> = _aperti.asStateFlow()

    /** Senza rete (non un no del server): si usa la copia, se c'è. */
    private fun senzaRete(e: Throwable): Boolean = e !is PonteServer.Rifiutato && e !is PonteServer.AccessoScaduto && (e is IOException || e.cause is IOException || e is java.net.SocketTimeoutException)

    /** Ora italiana, come quella del server (il telefono può avere un altro fuso). */
    private fun adesso(): String = LocalDateTime.now(java.time.ZoneId.of("Europe/Rome")).withNano(0).toString()

    /** Legge [azione] e la tiene in [nome]; senza rete torna l'ultima copia con "_lettoAl". */
    private suspend fun leggiOCopia(nome: String, azione: String, parametri: List<Pair<String, String>>): Result<JSONObject> {
        val r = esecutore.esegui { t.leggiAzione(azione, parametri) }
        r.onSuccess { o -> scaffale.scrivi(nome, JSONObject(o.toString()).put("_lettoAlCopia", adesso())) }
        val e = r.exceptionOrNull() ?: return r
        if (!senzaRete(e)) return r
        val copia = scaffale.leggi(nome) ?: return r
        return Result.success(JSONObject(copia.toString()).put("_lettoAl", copia.testo("_lettoAlCopia")))
    }

    // -------------------------------------------------- ticket

    /** I ticket di un segmento. Gli aperti senza filtri restano sul telefono (fase5.md §3.9). */
    suspend fun tickets(segmento: String = "aperti", altri: List<Pair<String, String>> = emptyList()): Result<ElencoTicket> {
        if (segmento == "aperti" && altri.isEmpty()) {
            return leggiOCopia("tickets-aperti", "tickets", listOf("segmento" to segmento)).map { o ->
                val l = ElencoTicket.daJson(o).let { if (o.has("_lettoAl")) it.copy(lettoAl = o.testo("_lettoAl")) else it }
                _aperti.value = l
                l
            }
        }
        return leggi { tickets(segmento, altri) }
    }

    /** Un ticket. Uno letto una volta si legge anche senza rete, con "letto alle…". */
    suspend fun ticket(chiave: String): Result<Ticket> =
        leggiOCopia("ticket-$chiave", "ticket", listOf("id" to chiave)).map { o ->
            val t = Ticket.daJson(o.optJSONObject("ticket") ?: throw PonteServer.Rifiutato("Il server non ha restituito il ticket"))
            if (!o.has("_lettoAl")) {
                // Lo stesso ticket si apre anche dal numero e dall'idLocale: le copie si allineano.
                listOf(t.id, t.numero, t.idLocale).filter { it.isNotBlank() && it != chiave }.forEach { k -> scaffale.scrivi("ticket-$k", o) }
            }
            if (o.has("_lettoAl")) t.copy(lettoAl = o.testo("_lettoAl")) else t
        }

    /** Il ticket nuovo (anche senza rete): in coda col suo idLocale. Torna la chiave per aprirlo. */
    fun nuovoTicket(corpo: JSONObject): String {
        val chiave = corpo.testo("idLocale").ifBlank { Ticket.nuovoIdLocale() }
        coda.ticket(chiave, corpo.put("idLocale", chiave))
        return chiave
    }

    /** Prendo io, Il lavoro è finito, Serve un altro intervento, Riprendi, In attesa: in coda, partono da sole. */
    fun azioneInCoda(chiave: String, azione: String, campi: JSONObject = JSONObject()) {
        coda.azioneTicket(chiave, JSONObject(campi.toString()).put("azione", azione))
    }

    fun prendi(chiave: String) = azioneInCoda(chiave, "prendiTicket")
    fun risolvi(chiave: String, esito: String = "") = azioneInCoda(chiave, "risolviTicket", if (esito.isNotBlank()) JSONObject().put("esito", esito) else JSONObject())
    fun altroIntervento(chiave: String) = azioneInCoda(chiave, "altroIntervento")

    /** La foto del guasto, già ridotta: in coda, parte da sola. */
    fun fotoTicket(chiave: String, file: File) = coda.fotoTicket(chiave, file)

    suspend fun salvaTicket(o: JSONObject) = scrivi { salvaTicket(o) }
    suspend fun azione(azione: String, id: String, campi: JSONObject = JSONObject()) = scrivi { azione(azione, id, campi) }
    suspend fun pianifica(id: String, inizio: LocalDateTime, fine: LocalDateTime?, assegnataA: String, luogo: String, note: String, conferma: Boolean) =
        scrivi { pianificaTicket(id, inizio, fine, assegnataA, luogo, note, conferma) }
    suspend fun chiudi(id: String, fatturazione: String, prezzoCorpo: Double?, motivo: String, conferma: Boolean) = scrivi { chiudiTicket(id, fatturazione, prezzoCorpo, motivo, conferma) }
    suspend fun legaRapportino(idRapportino: String, idTicket: String?) = scrivi { legaRapportino(idRapportino, idTicket) }
    suspend fun togliFoto(id: String, annulla: Boolean = false) = scrivi { togliFotoTicket(id, annulla) }

    suspend fun storicoImpianto(idSede: String, pagina: Int = 1): Result<StoricoImpianto> =
        if (pagina > 1) leggi { storicoImpianto(idSede, pagina) }
        else leggiOCopia("storico-$idSede", "storicoImpianto", listOf("idSede" to idSede)).map(StoricoImpianto::daJson)

    suspend fun statistiche(da: LocalDate?, a: LocalDate?, per: String) = leggi { statisticheTicket(da, a, per) }

    // -------------------------------------------------- contratti

    /** I contratti (restano sul telefono: il nuovo ticket propone quello dell'impianto anche senza rete). */
    suspend fun contratti(): Result<List<Contratto>> =
        leggiOCopia("contratti", "contratti", emptyList()).map { o -> o.optJSONArray("contratti").oggetti().map(Contratto::daJson) }

    /** I contratti letti per ultimi, senza chiedere al server. */
    fun contrattiLetti(): List<Contratto> = scaffale.leggi("contratti")?.optJSONArray("contratti").oggetti().map(Contratto::daJson)

    /** Il contratto valido che copre l'impianto [idSede] oggi (§8.2), fra quelli letti. */
    fun contrattoDi(idSede: String, oggi: LocalDate = LocalDate.now()): Contratto? =
        if (idSede.isBlank()) null else contrattiLetti().firstOrNull { c ->
            (c.stato == "attivo" || c.stato == "disdetto") && c.impianti.any { it.idSede == idSede } &&
                (dataDi(c.dal)?.let { !oggi.isBefore(it) } ?: true) && (dataDi(c.al)?.let { !oggi.isAfter(it) } ?: true)
        }

    suspend fun contratto(id: String) = leggi { contratto(id) }
    suspend fun salvaContratto(o: JSONObject) = scrivi { salvaContratto(o) }
    suspend fun attivaContratto(id: String) = scrivi { attivaContratto(id) }
    suspend fun rinnovaContratto(id: String, al: LocalDate?, canone: Double?, fatturazione: String?) = scrivi { rinnovaContratto(id, al, canone, fatturazione) }
    suspend fun disdiciContratto(id: String, data: LocalDate?, motivo: String) = scrivi { disdiciContratto(id, data, motivo) }
    suspend fun chiudiContratto(id: String, conferma: Boolean) = scrivi { chiudiContratto(id, conferma) }

    // -------------------------------------------------- documenti

    suspend fun documenti(filtro: FiltroArchivio) = leggi { documenti(filtro) }
    suspend fun documento(id: String) = leggi { documento(id) }
    suspend fun salvaDocumento(o: JSONObject) = scrivi { salvaDocumento(o) }
    suspend fun caricaVersione(id: String, idFile: String, nota: String) = scrivi { caricaVersione(id, idFile, nota) }
    suspend fun approva(idVersione: String) = scrivi { approvaVersione(idVersione) }
    suspend fun respingi(idVersione: String, motivo: String) = scrivi { respingiVersione(idVersione, motivo) }
    suspend fun annullaDecisione(idVersione: String) = scrivi { annullaDecisione(idVersione) }
    suspend fun togliVersione(idVersione: String, annulla: Boolean = false) = scrivi { togliVersione(idVersione, annulla) }
    suspend fun archivia(id: String, archiviato: Boolean, togliScadenza: Boolean? = null) = scrivi { archiviaDocumento(id, archiviato, togliScadenza) }
    suspend fun invia(id: String, idVersione: String, a: String, cc: String, oggetto: String, messaggio: String) = scrivi { inviaDocumento(id, idVersione, a, cc, oggetto, messaggio) }
    suspend fun condividi(id: String, perChi: String, giorni: Int?) = scrivi { condividiDocumento(id, perChi, giorni) }
    suspend fun categorie(): Result<List<CategoriaDoc>> =
        leggiOCopia("categorie", "categorieDocumenti", emptyList()).map { o -> o.optJSONArray("categorie").oggetti().map(CategoriaDoc::daJson) }
    suspend fun salvaCategoria(o: JSONObject) = scrivi { salvaCategoria(o) }
    suspend fun modelli() = leggi { modelli() }
    suspend fun salvaTestoModello(chiave: String, testo: String) = scrivi { salvaTestoModello(chiave, testo) }
    suspend fun componi(chiave: String, ids: Map<String, String>) = leggi { componiModello(chiave, ids) }
    suspend fun spazio() = leggi { spazio() }
    suspend fun svuotaCestino(conferma: Boolean) = scrivi { svuotaCestino(conferma) }

    /** Carica i byte di un file con /carica ([idFile] lo stesso se si riprova). */
    suspend fun carica(nome: String, mime: String, dati: ByteArray, per: String = "documento", idFile: String = nuovoIdFile()) = leggi { carica(nome, mime, idFile, per, dati) }

    fun nuovoIdFile(): String = "F-" + UUID.randomUUID().toString().replace("-", "").take(20)

    // -------------------------------------------------- scadenze

    /** Le scadenze aperte divise; restano sul telefono. */
    suspend fun scadenze(): Result<ElencoScadenze> = leggiOCopia("scadenze", "scadenze", emptyList()).map(ElencoScadenze::daJson)
    suspend fun scadenzePeriodo(da: LocalDate, a: LocalDate) = leggi { scadenze(listOf("da" to da.toString(), "a" to a.toString())) }
    suspend fun scadenzeDi(altri: List<Pair<String, String>>) = leggi { scadenze(altri) }
    suspend fun salvaScadenza(o: JSONObject) = scrivi { salvaScadenza(o) }
    suspend fun faiScadenzaSubito(id: String, data: LocalDate?, idDocumento: String) = scrivi { faiScadenza(id, data, idDocumento) }
    suspend fun togliScadenza(id: String, motivo: String, ancheProssime: Boolean) = scrivi { togliScadenza(id, motivo, ancheProssime) }

    /** Segna fatta anche senza rete: in coda, parte da sola (la ripetuta non rifà la prossima). */
    fun faiScadenza(id: String, data: LocalDate = LocalDate.now()) = coda.faiScadenza(id, JSONObject().put("data", data.toString()))

    // -------------------------------------------------- file: tenuti sul telefono, aperti di recente

    private fun salvaIn(dir: File, nome: String, byte: ByteArray): File {
        dir.mkdirs()
        return File(dir, nome.replace(Regex("""[\\/:*?"<>|]"""), "_").ifBlank { "documento" }).apply { writeBytes(byte) }
    }

    private fun recenti(): File? = cartellaFile?.let { File(it, "documenti-recenti") }

    /** Il file [idFile] se è già sul telefono (tenuto o aperto di recente). */
    fun suTelefono(idFile: String): File? =
        listOfNotNull(tenuti, recenti()).flatMap { d -> d.listFiles()?.filter { it.name.startsWith("$idFile.") }.orEmpty() }.firstOrNull()

    fun tenuto(idFile: String): Boolean = tenuti?.listFiles()?.any { it.name.startsWith("$idFile.") } == true

    /**
     * Il file da aprire o condividere, in cacheDir/pdf col nome giusto. Prima il
     * telefono (tenuti e recenti), poi il server; senza rete e senza copia: "Si apre
     * quando c'è rete".
     */
    suspend fun fileDaAprire(idFile: String, nome: String): Result<File> = esecutore.esegui {
        val pdf = File(cartellaFile ?: throw PonteServer.Rifiutato("Il file qui non si apre"), "pdf")
        suTelefono(idFile)?.let { return@esegui salvaIn(pdf, nome, it.readBytes()) }
        val (byte, _) = try {
            t.file(idFile)
        } catch (e: IOException) {
            throw PonteServer.Rifiutato("Si apre quando c'è rete")
        }
        recenti()?.let { d -> runCatching { pulisci(d, 100L * 1024 * 1024); salvaIn(d, idFile + "." + estensione(nome), byte) } }
        salvaIn(pdf, nome, byte)
    }

    /** "Tieni sul telefono" (fino a 300 MB: si tolgono i più vecchi). */
    suspend fun tieni(idFile: String, nome: String): Result<Unit> = esecutore.esegui {
        val d = tenuti ?: throw PonteServer.Rifiutato("Qui non si tiene niente")
        val byte = suTelefono(idFile)?.readBytes() ?: try {
            t.file(idFile).first
        } catch (e: IOException) {
            throw PonteServer.Rifiutato("Serve la rete per scaricarlo la prima volta")
        }
        salvaIn(d, idFile + "." + estensione(nome), byte)
        pulisci(d, 300L * 1024 * 1024)
        Unit
    }

    fun nonTenere(idFile: String) {
        tenuti?.listFiles()?.filter { it.name.startsWith("$idFile.") }?.forEach { it.delete() }
    }

    private fun estensione(nome: String) = nome.substringAfterLast('.', "bin").take(8).ifBlank { "bin" }

    private fun pulisci(d: File, massimo: Long) {
        val tutti = d.listFiles()?.sortedBy { it.lastModified() }?.toMutableList() ?: return
        var totale = tutti.sumOf { it.length() }
        while (totale > massimo && tutti.size > 1) {
            val f = tutti.removeAt(0)
            totale -= f.length()
            f.delete()
        }
    }

    /** Un CSV per Excel in cacheDir/pdf, pronto per Condividi. */
    suspend fun esporta(cosa: String, parametri: List<Pair<String, String>> = emptyList()): Result<File> = esecutore.esegui {
        val (nome, byte) = f.esporta(cosa, parametri)
        salvaIn(File(cartellaFile ?: throw PonteServer.Rifiutato("Il file qui non si salva"), "pdf"), nome.replace(Regex("""[^A-Za-z0-9._ -]"""), "_"), byte)
    }

    /** Un file fatto sul telefono (una lettera in PDF) in byte: per salvarlo nell'archivio. */
    fun leggiFile(f: File): ByteArray = f.readBytes()

    companion object {
        /** Le cose che si mandano ai documenti: da un elenco di JSON. */
        fun lista(l: List<JSONObject>): JSONArray = JSONArray().apply { l.forEach { put(it) } }
    }
}
