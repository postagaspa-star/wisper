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

    constructor(ctx: Context) : this(File(ctx.filesDir, "coda-invii.json"))

    enum class Tipo { SALVA, FOTO, FIRMA, STATO, TOGLI_FOTO }

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
    ) {
        val rifiutata: Boolean get() = errore.isNotBlank()
    }

    private val lucchetto = Any()

    /**
     * Mette in coda. Un rapportino salvato due volte prima di partire occupa un
     * posto solo, quello del primo salvataggio, con il contenuto dell'ultimo:
     * al foglio arriva la versione giusta, una volta sola.
     */
    fun aggiungi(op: Operazione): Operazione = synchronized(lucchetto) {
        val attuali = leggi()
        val doppione = if (op.tipo == Tipo.SALVA) {
            attuali.firstOrNull { it.tipo == Tipo.SALVA && it.idLocale == op.idLocale && !it.rifiutata }
        } else null
        if (doppione != null) {
            val aggiornata = doppione.copy(rapportino = op.rapportino)
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
        )
    }
}
