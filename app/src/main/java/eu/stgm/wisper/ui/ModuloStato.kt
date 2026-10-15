package eu.stgm.wisper.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import eu.stgm.wisper.rapportino.Numeri
import eu.stgm.wisper.rapportino.Rapportino
import eu.stgm.wisper.rapportino.Regole
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * Il modulo mentre lo si compila. I numeri restano testo finche' non si salva:
 * "6," a meta' digitazione non e' un numero, ma non e' nemmeno un errore.
 *
 * [base] e' il rapportino da cui si parte, con quello che sa il foglio (numero,
 * stato, foto gia' caricate). Il modulo cambia solo i campi che si compilano.
 */
class ModuloStato(base: Rapportino, val nuovo: Boolean, tariffaToccata: Boolean = !nuovo) {
    var base by mutableStateOf(base)

    var data by mutableStateOf(base.data)
    var cliente by mutableStateOf(base.cliente)
    var idCliente by mutableStateOf(base.idCliente)
    /** Solo per un cliente nuovo, scritto qui: a quale gruppo appartiene. */
    var gruppoNuovo by mutableStateOf(base.gruppo.ifBlank { "Privato" })
    var commessa by mutableStateOf(base.commessa)
    var idCommessa by mutableStateOf(base.idCommessa)
    var ticket by mutableStateOf(base.ticket)
    var luogo by mutableStateOf(base.luogo)
    var descrizione by mutableStateOf(base.descrizione)
    var oreLavoro by mutableStateOf(Numeri.scrivi(base.oreLavoro, vuotoSeZero = true))
    var oreExtra by mutableStateOf(Numeri.scrivi(base.oreExtra, vuotoSeZero = true))
    var oreViaggio by mutableStateOf(Numeri.scrivi(base.oreViaggio, vuotoSeZero = true))
    var km by mutableStateOf(Numeri.scrivi(base.km, vuotoSeZero = true))
    var spese by mutableStateOf(Numeri.scrivi(base.spese, vuotoSeZero = true))
    var noteSpese by mutableStateOf(base.noteSpese)
    var tariffa by mutableStateOf(Numeri.scrivi(base.tariffa))
    /** Vero se la tariffa l'ha scritta la persona: allora non la si sovrascrive con quella proposta. */
    var tariffaToccata by mutableStateOf(tariffaToccata)
    var noteInterne by mutableStateOf(base.noteInterne)

    /** Foto fatte in questo modulo: partono quando si salva, dopo il rapportino. */
    val fotoNuove = mutableStateListOf<File>()

    var errori by mutableStateOf(emptyMap<String, String>())

    /** Il cliente e' nuovo se non ha ancora un codice del foglio. */
    val clienteNuovo: Boolean get() = idCliente.isBlank() && cliente.isNotBlank()

    fun rapportino(): Rapportino = base.copy(
        data = data,
        cliente = cliente.trim(),
        idCliente = idCliente,
        gruppo = if (clienteNuovo) gruppoNuovo else base.gruppo,
        commessa = commessa.trim(),
        idCommessa = idCommessa,
        ticket = ticket.trim(),
        luogo = luogo.trim(),
        descrizione = descrizione.trim(),
        oreLavoro = Numeri.leggi(oreLavoro) ?: 0.0,
        oreExtra = Numeri.leggi(oreExtra) ?: 0.0,
        oreViaggio = Numeri.leggi(oreViaggio) ?: 0.0,
        km = Numeri.leggi(km) ?: 0.0,
        spese = Numeri.leggi(spese) ?: 0.0,
        noteSpese = noteSpese.trim(),
        tariffa = Numeri.leggi(tariffa),
        noteInterne = noteInterne.trim(),
    )

    /** Vero se c'e' qualcosa da salvare rispetto a com'era all'apertura. */
    val cambiato: Boolean
        get() = nuovo || fotoNuove.isNotEmpty() || rapportino().soloCompilato() != base.soloCompilato()

    /**
     * Controlla che il rapportino stia in piedi. Gli errori si scrivono sotto il
     * campo che li ha, con le parole di chi compila e non col nome del campo.
     */
    fun valida(regole: Regole): Boolean {
        val e = mutableMapOf<String, String>()
        if (cliente.isBlank()) e["cliente"] = "Scegli il cliente"
        if (descrizione.isBlank()) e["descrizione"] = "Scrivi che lavoro hai fatto"
        listOf("oreLavoro" to oreLavoro, "oreExtra" to oreExtra, "oreViaggio" to oreViaggio, "km" to km, "spese" to spese)
            .forEach { (campo, testo) ->
                if (testo.isNotBlank() && Numeri.leggi(testo) == null) e[campo] = "Non è un numero"
            }
        val ore = listOf(oreLavoro, oreExtra, oreViaggio).sumOf { Numeri.leggi(it) ?: 0.0 }
        if (ore <= 0.0 && "oreLavoro" !in e) e["oreLavoro"] = "Mancano le ore"
        if (regole.tariffaFissa == null && (Numeri.leggi(tariffa) ?: 0.0) <= 0.0) {
            e["tariffa"] = "Scrivi la tariffa oraria"
        }
        errori = e
        return e.isEmpty()
    }

    // ---- la copia su disco, se Android chiude l'app mentre si fa una foto ----

    fun aJson(): JSONObject = JSONObject()
        .put("nuovo", nuovo)
        .put("tariffaToccata", tariffaToccata)
        .put("base", base.aJson())
        .put("rapportino", rapportino().aJson())
        .put("fotoNuove", JSONArray(fotoNuove.map { it.path }))

    companion object {
        fun daJson(o: JSONObject): ModuloStato {
            val base = Rapportino.daJson(o.getJSONObject("base"))
            val compilato = Rapportino.daJson(o.getJSONObject("rapportino"))
            return ModuloStato(compilato.copy(id = base.id, foto = base.foto, firma = base.firma, stato = base.stato),
                o.optBoolean("nuovo"), o.optBoolean("tariffaToccata")).also { s ->
                // Si riparte dal rapportino com'era all'apertura, cosi' "cambiato"
                // vede le modifiche fatte prima della chiusura.
                s.base = base
                val fotoNuove = o.optJSONArray("fotoNuove")
                (0 until (fotoNuove?.length() ?: 0)).map { File(fotoNuove!!.getString(it)) }
                    .filter { it.exists() }
                    .forEach { s.fotoNuove.add(it) }
            }
        }
    }
}

/**
 * Il modulo in corso, salvato su disco a ogni modifica.
 *
 * Fare la foto di uno scontrino apre la fotocamera, cioe' un'altra app, e su
 * un telefono con poca memoria Android puo' chiudere Wisper nel frattempo:
 * senza questa copia, al ritorno il rapportino a meta' sarebbe sparito.
 */
class BozzaModulo(cartella: File) {
    private val file = File(cartella, "modulo-in-corso.json")

    fun esiste(): Boolean = file.exists()

    fun leggi(): ModuloStato? = runCatching { ModuloStato.daJson(JSONObject(file.readText())) }.getOrNull()

    fun scrivi(s: ModuloStato) {
        runCatching {
            val tmp = File(file.parentFile, file.name + ".tmp")
            tmp.writeText(s.aJson().toString())
            if (!tmp.renameTo(file)) { file.delete(); tmp.renameTo(file) }
        }
    }

    fun cancella() {
        file.delete()
    }
}
