package eu.stgm.wisper.rapportino

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.util.UUID

/**
 * Tutto quello che e' stato fatto sul telefono e non e' ancora arrivato al
 * foglio, tenuto in un file: rapportini salvati, foto di spese, firme, cambi di
 * stato.
 *
 * PERCHE' ESISTE, misurato il 26/09. Fra "salva" e la riga sul foglio sono
 * passati diciotto secondi e mezzo, tutti dell'Apps Script, e in quel tempo il
 * rapportino esisteva solo in memoria: bastava che Android chiudesse l'app, o
 * che in cantiere sparisse il segnale, e la giornata di lavoro era persa senza
 * che nessuno se ne accorgesse.
 *
 * L'ordine e' quindi: prima il telefono, poi il foglio. Un'operazione esce da
 * qui solo quando il foglio ha risposto, e fino ad allora sopravvive a tutto:
 * schermo spento, rete assente, app chiusa, telefono riavviato.
 *
 * Le operazioni partono nell'ordine in cui sono state fatte, perche' dipendono
 * l'una dall'altra: la foto di uno scontrino ha bisogno che la riga del suo
 * rapportino esista gia'.
 */
class CodaInvii(private val file: File) {

    companion object {
        val TIPI_FASE6 = setOf(Tipo.ASSENZA, Tipo.ANNULLA_ASSENZA, Tipo.KM, Tipo.FOTO_KM, Tipo.GUASTO, Tipo.FOTO_GUASTO, Tipo.PRESTITO, Tipo.RESTITUISCI, Tipo.FIRMA_DPI)

        /** Quelle col contenuto personale (le assenze): negli avvisi del telefono niente motivo, che potrebbe dire il tipo. */
        val PERSONALI = setOf(Tipo.ASSENZA, Tipo.ANNULLA_ASSENZA)
    }

    constructor(ctx: Context) : this(File(ctx.filesDir, "coda-invii.json"))

    /**
     * SALVA, FOTO, FIRMA, STATO e TOGLI_FOTO sono dei rapportini. Dalla fase 3 del
     * gestionale anche ORE (salvaOre), SPESA (salvaSpesa) e FOTO_SPESA (lo
     * scontrino di una spesa): si scrivono spesso in cantiere senza rete.
     */
    enum class Tipo {
        SALVA, FOTO, FIRMA, STATO, TOGLI_FOTO, ORE, SPESA, FOTO_SPESA,
        /**
         * Fase 5 (fase5.md §3.9): il ticket nato senza rete (salvaTicket col suo
         * idLocale "T-..."), le azioni di stato che il server riconosce ripetute
         * (prendi, risolvi, altro intervento, riprendi, sospendi), la foto del ticket
         * (caricaFile con lo stesso idFile) e la scadenza segnata fatta.
         */
        TICKET, AZIONE_TICKET, FOTO_TICKET, FAI_SCADENZA,

        /**
         * Fase 6 (fase6.md §3.13): la richiesta di ferie o permesso e la malattia
         * (salvaAssenza col suo idLocale "A-..."), l'annullamento di una mia richiesta,
         * i km (segnaKm, idLocale "K-...") con la foto del contachilometri, il guasto
         * (segnalaGuasto, "G-...") con le sue foto, Lo prendo io e Restituisci
         * (assegna e restituisci con l'idLocale), la firma di una consegna di DPI.
         * Ripetuti uguali, il server torna la stessa riga (giaArrivata).
         */
        ASSENZA, ANNULLA_ASSENZA, KM, FOTO_KM, GUASTO, FOTO_GUASTO, PRESTITO, RESTITUISCI, FIRMA_DPI,
    }

    /**
     * @param errore il motivo per cui il foglio ha detto di no. Un'operazione
     *        rifiutata non si riprova da sola (riprovare uguale non serve) e
     *        ferma quelle dopo, che potrebbero dipenderne: decide chi usa
     *        l'app, riprovando o scartandola.
     * @param tentativi quante volte la rete non ha risposto.
     */
    data class Operazione(
        val idOp: String,
        val tipo: Tipo,
        val idLocale: String,
        val rapportino: Rapportino? = null,
        val idFile: String = "",
        val percorso: String = "",
        val firmatario: String = "",
        val firmatoIl: String = "",
        val stato: Stato? = null,
        val fileId: String = "",
        val tentativi: Int = 0,
        val errore: String = "",
        /** ORE e SPESA: il corpo di salvaOre / salvaSpesa (JSON come testo). */
        val corpo: String = "",
        /**
         * L'id che il server ha dato alla riga nata qui (per le modifiche e lo
         * scontrino dopo). Finche' non c'e', la riga parte col suo idLocale, lo
         * stesso a ogni tentativo: il server non la crea due volte (InvioFase3).
         */
        val idRemoto: String = "",
        /** Quando è stata fatta sul telefono (istante "2026-10-22T10:05:00"): la cronologia del ticket. */
        val quando: String = "",
    ) {
        val rifiutata: Boolean get() = errore.isNotBlank()

        /** Le cose della fase 3 (ore, spese, scontrini): non sono di un rapportino. */
        val fase3: Boolean get() = tipo == Tipo.ORE || tipo == Tipo.SPESA || tipo == Tipo.FOTO_SPESA

        /** Le cose della fase 5 (ticket, foto del ticket, scadenze): non sono di un rapportino. */
        val fase5: Boolean get() = tipo == Tipo.TICKET || tipo == Tipo.AZIONE_TICKET || tipo == Tipo.FOTO_TICKET || tipo == Tipo.FAI_SCADENZA

        /** Le cose della fase 6 (assenze, km, guasti, prestiti, firme dei DPI): non sono di un rapportino. */
        val fase6: Boolean get() = tipo in TIPI_FASE6

        fun corpoJson(): JSONObject = runCatching { JSONObject(corpo) }.getOrDefault(JSONObject())
    }

    private val lucchetto = Any()

    /**
     * Mette in coda. Un rapportino salvato due volte prima di partire occupa un
     * posto solo, quello del primo salvataggio, con il contenuto dell'ultimo:
     * al foglio arriva la versione giusta, una volta sola.
     */
    fun aggiungi(op: Operazione): Operazione = synchronized(lucchetto) {
        val attuali = leggi()
        val doppione = if (op.tipo == Tipo.SALVA || op.tipo == Tipo.ORE || op.tipo == Tipo.SPESA || op.tipo == Tipo.TICKET || op.tipo == Tipo.ASSENZA) {
            attuali.firstOrNull { it.tipo == op.tipo && it.idLocale == op.idLocale && !it.rifiutata }
        } else null
        if (doppione != null) {
            val aggiornata = doppione.copy(rapportino = op.rapportino, corpo = op.corpo)
            scrivi(attuali.map { if (it.idOp == doppione.idOp) aggiornata else it })
            aggiornata
        } else {
            scrivi(attuali + op)
            op
        }
    }

    fun salva(r: Rapportino) = aggiungi(Operazione(nuovoId(), Tipo.SALVA, r.idLocale, rapportino = r))

    fun foto(idLocale: String, idFile: String, percorso: String) =
        aggiungi(Operazione(nuovoId(), Tipo.FOTO, idLocale, idFile = idFile, percorso = percorso))

    fun firma(idLocale: String, idFile: String, percorso: String, firmatario: String, firmatoIl: String) =
        aggiungi(
            Operazione(
                nuovoId(), Tipo.FIRMA, idLocale, idFile = idFile, percorso = percorso,
                firmatario = firmatario, firmatoIl = firmatoIl,
            )
        )

    fun stato(idLocale: String, stato: Stato) =
        aggiungi(Operazione(nuovoId(), Tipo.STATO, idLocale, stato = stato))

    fun togliFoto(idLocale: String, fileId: String) =
        aggiungi(Operazione(nuovoId(), Tipo.TOGLI_FOTO, idLocale, fileId = fileId))

    /** Le ore (salvaOre {riga}) della riga [chiave]: "ore:<id>" se il server la conosce, "O-..." se e' nata qui. */
    fun ore(chiave: String, corpo: JSONObject, idRemoto: String = "") =
        aggiungi(Operazione(nuovoId(), Tipo.ORE, chiave, corpo = corpo.toString(), idRemoto = idRemoto))

    /** Una spesa (salvaSpesa {spesa}): "spesa:<id>" o "S-...". */
    fun spesa(chiave: String, corpo: JSONObject, idRemoto: String = "") =
        aggiungi(Operazione(nuovoId(), Tipo.SPESA, chiave, corpo = corpo.toString(), idRemoto = idRemoto))

    /** Lo scontrino della spesa [chiave], gia' ridotto in [percorso]. [idFile] e' lo stesso a ogni tentativo. */
    fun fotoSpesa(chiave: String, idFile: String, percorso: String, idRemoto: String = "") =
        aggiungi(Operazione(nuovoId(), Tipo.FOTO_SPESA, chiave, idFile = idFile, percorso = percorso, idRemoto = idRemoto))

    private fun adesso(): String = java.time.LocalDateTime.now().withNano(0).toString()

    /** Un ticket nato qui (salvaTicket {ticket}): [chiave] è il suo idLocale "T-...", lo stesso a ogni tentativo. */
    fun ticket(chiave: String, corpo: JSONObject) =
        aggiungi(Operazione(nuovoId(), Tipo.TICKET, chiave, corpo = corpo.toString(), quando = adesso()))

    /** Un'azione di stato del ticket [chiave] (id, numero o idLocale): {azione, motivo?, esito?}. */
    fun azioneTicket(chiave: String, corpo: JSONObject) =
        aggiungi(Operazione(nuovoId(), Tipo.AZIONE_TICKET, chiave, corpo = corpo.toString(), quando = adesso()))

    /** La foto del ticket [chiave], già ridotta in [percorso]. [idFile] è lo stesso a ogni tentativo. */
    fun fotoTicket(chiave: String, idFile: String, percorso: String) =
        aggiungi(Operazione(nuovoId(), Tipo.FOTO_TICKET, chiave, idFile = idFile, percorso = percorso, quando = adesso()))

    /** La scadenza [id] segnata fatta (faiScadenza {id, data?, idDocumento?}): ripetuta uguale, il server non rifà niente. */
    fun faiScadenza(id: String, corpo: JSONObject) =
        aggiungi(Operazione(nuovoId(), Tipo.FAI_SCADENZA, "scadenza:$id", corpo = corpo.toString(), quando = adesso()))

    // ---- fase 6 (fase6.md §3.13)

    /** Una richiesta di ferie, un permesso o una malattia (salvaAssenza {assenza}): [chiave] è il suo idLocale "A-...". */
    fun assenza(chiave: String, corpo: JSONObject) =
        aggiungi(Operazione(nuovoId(), Tipo.ASSENZA, chiave, corpo = corpo.toString(), quando = adesso()))

    /** Annulla una mia richiesta già arrivata (annullaAssenza {id, motivo?}). */
    fun annullaAssenza(id: String, corpo: JSONObject) =
        aggiungi(Operazione(nuovoId(), Tipo.ANNULLA_ASSENZA, "assenza:$id", corpo = corpo.toString(), quando = adesso()))

    /** I km di un mezzo (segnaKm {idVeicolo, km, data, conferma?}): [chiave] è l'idLocale "K-..." della lettura. */
    fun km(chiave: String, corpo: JSONObject) =
        aggiungi(Operazione(nuovoId(), Tipo.KM, chiave, corpo = corpo.toString(), quando = adesso()))

    /** La foto del contachilometri della lettura [chiave], già ridotta. [idFile] è lo stesso a ogni tentativo. */
    fun fotoKm(chiave: String, idFile: String, percorso: String) =
        aggiungi(Operazione(nuovoId(), Tipo.FOTO_KM, chiave, idFile = idFile, percorso = percorso, quando = adesso()))

    /** Un guasto (segnalaGuasto {guasto}): [chiave] è il suo idLocale "G-...". */
    fun guasto(chiave: String, corpo: JSONObject) =
        aggiungi(Operazione(nuovoId(), Tipo.GUASTO, chiave, corpo = corpo.toString(), quando = adesso()))

    /** Una foto del guasto [chiave] (anche più d'una), già ridotta. */
    fun fotoGuasto(chiave: String, idFile: String, percorso: String) =
        aggiungi(Operazione(nuovoId(), Tipo.FOTO_GUASTO, chiave, idFile = idFile, percorso = percorso, quando = adesso()))

    /** Lo prendo io (assegna {tipo: "prestito", ...}): [chiave] è l'idLocale "P-..." del prestito. */
    fun prestito(chiave: String, corpo: JSONObject) =
        aggiungi(Operazione(nuovoId(), Tipo.PRESTITO, chiave, corpo = corpo.toString(), quando = adesso()))

    /** Restituisci (restituisci {idVeicolo | idAttrezzatura}): [chiave] è l'idLocale "R-..." del rientro. */
    fun restituisci(chiave: String, corpo: JSONObject) =
        aggiungi(Operazione(nuovoId(), Tipo.RESTITUISCI, chiave, corpo = corpo.toString(), quando = adesso()))

    /** La firma della consegna di DPI [id] (firmaConsegna): il PNG in [percorso]; ripetuta, il server la tiene una volta. */
    fun firmaDpi(id: String, idFile: String, percorso: String) =
        aggiungi(Operazione(nuovoId(), Tipo.FIRMA_DPI, "dpi:$id", idFile = idFile, percorso = percorso, quando = adesso()))

    /**
     * Il server ha risposto per [idOp], col contenuto [corpoInviato]: l'operazione
     * esce dalla coda, e tutte quelle della stessa riga ([chiave]) imparano il suo
     * id ([idRemoto]), in una scrittura sola. Se nel frattempo la riga e' stata
     * cambiata di nuovo (corpo diverso), l'operazione resta: ripartira' come
     * modifica, con l'id.
     */
    fun completa(idOp: String, corpoInviato: String, chiave: String, idRemoto: String) = synchronized(lucchetto) {
        val attuali = leggi()
        val op = attuali.firstOrNull { it.idOp == idOp }
        val cambiata = op != null && op.corpo != corpoInviato
        scrivi(attuali.mapNotNull { o ->
            when {
                o.idOp == idOp -> if (cambiata) o.copy(idRemoto = idRemoto.ifBlank { o.idRemoto }, tentativi = 0) else null
                idRemoto.isNotBlank() && o.idLocale == chiave && o.fase3 -> o.copy(idRemoto = idRemoto)
                else -> o
            }
        })
    }

    /**
     * La riga [chiave] era gia' sul server col suo id [idRemoto], ma qui e' stata
     * cambiata: l'operazione [idOp] resta in coda e, come tutte quelle della
     * stessa riga, impara l'id. Ripartira' come modifica.
     */
    fun impara(idOp: String, chiave: String, idRemoto: String) = synchronized(lucchetto) {
        scrivi(leggi().map { o -> if (o.idOp == idOp || (o.idLocale == chiave && o.fase3)) o.copy(idRemoto = idRemoto, tentativi = 0) else o })
    }

    /** In ordine di arrivo. */
    fun tutte(): List<Operazione> = synchronized(lucchetto) { leggi() }

    fun diRapportino(idLocale: String): List<Operazione> = tutte().filter { it.idLocale == idLocale }

    /** Sostituisce l'operazione con lo stesso idOp, se c'e' ancora. */
    fun aggiorna(op: Operazione) = synchronized(lucchetto) {
        scrivi(leggi().map { if (it.idOp == op.idOp) op else it })
    }

    fun togli(idOp: String) = synchronized(lucchetto) {
        scrivi(leggi().filterNot { it.idOp == idOp })
    }

    // ---- file ----

    private fun nuovoId() = UUID.randomUUID().toString()

    private fun leggi(): List<Operazione> {
        if (!file.exists()) return emptyList()
        return try {
            val a = JSONArray(file.readText())
            (0 until a.length()).mapNotNull { i -> a.optJSONObject(i)?.let(::daJson) }
        } catch (_: Exception) {
            // Un file illeggibile non si sovrascrive: dentro possono esserci
            // rapportini veri. Si mette da parte, a mano si recuperano ancora.
            file.renameTo(File(file.parentFile, file.name + ".illeggibile-" + System.currentTimeMillis()))
            emptyList()
        }
    }

    /**
     * Scrittura atomica: prima un file a parte, poi lo scambio. Se Android
     * uccide l'app a meta' scrittura resta il file vecchio intero, non uno
     * troncato che al prossimo avvio non si legge piu'.
     */
    private fun scrivi(operazioni: List<Operazione>) {
        val tmp = File(file.parentFile, file.name + ".tmp")
        tmp.writeText(JSONArray().apply { operazioni.forEach { put(aJson(it)) } }.toString())
        if (!tmp.renameTo(file)) {
            // Su alcuni telefoni renameTo non sovrascrive: si toglie prima il vecchio.
            file.delete()
            if (!tmp.renameTo(file)) throw IOException("non riesco a scrivere ${file.name}")
        }
    }

    private fun aJson(op: Operazione): JSONObject = JSONObject()
        .put("idOp", op.idOp)
        .put("tipo", op.tipo.name)
        .put("idLocale", op.idLocale)
        .put("rapportino", op.rapportino?.aJson() ?: JSONObject.NULL)
        .put("idFile", op.idFile)
        .put("percorso", op.percorso)
        .put("firmatario", op.firmatario)
        .put("firmatoIl", op.firmatoIl)
        .put("stato", op.stato?.name ?: JSONObject.NULL)
        .put("fileId", op.fileId)
        .put("tentativi", op.tentativi)
        .put("errore", op.errore)
        .put("corpo", op.corpo)
        .put("idRemoto", op.idRemoto)
        .put("quando", op.quando)

    private fun daJson(o: JSONObject): Operazione? {
        val idOp = o.testo("idOp").takeIf { it.isNotBlank() } ?: return null
        val tipo = Tipo.entries.firstOrNull { it.name == o.testo("tipo") } ?: return null
        return Operazione(
            idOp = idOp,
            tipo = tipo,
            idLocale = o.testo("idLocale"),
            rapportino = o.optJSONObject("rapportino")?.let { Rapportino.daJson(it) },
            idFile = o.testo("idFile"),
            percorso = o.testo("percorso"),
            firmatario = o.testo("firmatario"),
            firmatoIl = o.testo("firmatoIl"),
            stato = o.testo("stato").takeIf { it.isNotBlank() }?.let { Stato.da(it) },
            fileId = o.testo("fileId"),
            tentativi = o.optInt("tentativi"),
            errore = o.testo("errore"),
            // Il corpo e' un JSON scritto come testo: si legge com'e'.
            corpo = if (o.has("corpo") && !o.isNull("corpo")) o.optString("corpo") else "",
            idRemoto = o.testo("idRemoto"),
            quando = o.testo("quando"),
        )
    }
}
