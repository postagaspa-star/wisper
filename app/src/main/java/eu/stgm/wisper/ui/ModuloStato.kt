package eu.stgm.wisper.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import eu.stgm.wisper.rapportino.Numeri
import eu.stgm.wisper.rapportino.Progetto
import eu.stgm.wisper.rapportino.ProgettoNuovo
import eu.stgm.wisper.rapportino.Rapportino
import eu.stgm.wisper.rapportino.Regole
import eu.stgm.wisper.rapportino.RegoleProgetti
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
class ModuloStato(
    base: Rapportino,
    val nuovo: Boolean,
    tariffaToccata: Boolean = !nuovo,
    passoIniziale: Int = if (nuovo) 1 else 4,
) {
    var base by mutableStateOf(base)

    /** 1 Per chi, 2 Ore e strada, 3 Il lavoro, 4 Riepilogo. */
    var passo by mutableIntStateOf(passoIniziale)
    /** Si è arrivati a un passo da "Cambia" del riepilogo: Avanti torna lì. */
    var tornaAlRiepilogo by mutableStateOf(false)
    /** Al passo 1, dopo aver cercato un cliente: si sceglie la sua commessa. */
    var sceltaCommessa by mutableStateOf(false)
    /** Al passo 1, dopo la commessa: si sceglie il suo progetto (progetti.md §4.5). */
    var sceltaProgetto by mutableStateOf(false)
    /**
     * La funzione Progetti e' accesa: il rapportino vuole il progetto. La mette la schermata a ogni composizione (dalla
     * sessione): un valore semplice, non uno stato, cosi' scriverlo mentre si disegna non fa ridisegnare niente.
     */
    var progettiAttivi = false

    /**
     * Dal 06/11/2026 il progetto (e la commessa) e' obbligatorio solo per Elettrodinamica, dal nome del cliente
     * ([RegoleProgetti.progettoObbligatorio]); per gli altri clienti si sceglie ma si puo' lasciare "Nessun progetto".
     */
    val progettoRichiesto: Boolean get() = progettiAttivi && RegoleProgetti.progettoObbligatorio(cliente)
    var ricerca by mutableStateOf("")
    var extraAperto by mutableStateOf(base.oreExtra > 0)
    var speseAperte by mutableStateOf(base.spese > 0 || base.noteSpese.isNotBlank())
    var luogoAperto by mutableStateOf(base.luogo.isNotBlank())
    var notaAperta by mutableStateOf(base.noteInterne.isNotBlank())

    var data by mutableStateOf(base.data)
    var cliente by mutableStateOf(base.cliente)
    var idCliente by mutableStateOf(base.idCliente)
    var commessa by mutableStateOf(base.commessa)
    var idCommessa by mutableStateOf(base.idCommessa)
    /** Il codice di una commessa nuova scritta qui (26ST047): si vede subito. */
    var codiceProposto by mutableStateOf(base.codiceProposto)
    /** Il progetto scelto (id del server) oppure quello nato qui ([progettoNuovo]), con codice, descrizione e intestatario. */
    var idProgetto by mutableStateOf(base.idProgetto)
    var progetto by mutableStateOf(base.progetto)
    var progettoDescrizione by mutableStateOf(base.progettoDescrizione)
    var progettoIntestatoA by mutableStateOf(base.progettoIntestatoA)
    var progettoNuovo by mutableStateOf(base.progettoNuovo)
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

    /** Fase 6 (§3.9): gli strumenti usati (null = non toccati: non si mandano) e la riga aperta. */
    var strumenti by mutableStateOf(base.strumenti)
    var strumentiAperti by mutableStateOf(!base.strumenti.isNullOrEmpty())

    /** Foto fatte in questo modulo: partono quando si salva, dopo il rapportino. */
    val fotoNuove = mutableStateListOf<File>()

    var errori by mutableStateOf(emptyMap<String, String>())

    /** "ED-003 · Quadro QE1", vuoto se non c'e' progetto. */
    val etichettaProgetto: String get() = Progetto.etichetta(progetto, progettoDescrizione)

    /** Un progetto scelto dall'elenco (anche uno nato sul telefono e ancora in coda: allora resta "nuovo", con lo stesso idLocale). */
    fun scegliProgetto(p: Progetto) {
        if (p.inAttesa) {
            idProgetto = ""; progettoNuovo = ProgettoNuovo.da(p, codiceProposto = true)
        } else {
            idProgetto = p.id; progettoNuovo = null
        }
        progetto = p.codice; progettoDescrizione = p.descrizione; progettoIntestatoA = p.intestatoA
        errori = errori - "progetto"
    }

    /** Il progetto nato qui, anche senza rete: parte col rapportino. */
    fun nuovoProgetto(n: ProgettoNuovo) {
        idProgetto = ""; progettoNuovo = n
        progetto = n.codice; progettoDescrizione = n.descrizione; progettoIntestatoA = n.intestatoA
        errori = errori - "progetto"
    }

    /** Cambiata la commessa (o il cliente), il progetto di prima non vale piu'. */
    fun togliProgetto() {
        idProgetto = ""; progettoNuovo = null; progetto = ""; progettoDescrizione = ""; progettoIntestatoA = ""
    }

    /** Il cliente e' nuovo se non ha ancora un codice del foglio. */
    val clienteNuovo: Boolean get() = idCliente.isBlank() && cliente.isNotBlank()

    fun rapportino(): Rapportino = base.copy(
        data = data,
        cliente = cliente.trim(),
        idCliente = idCliente,
        commessa = commessa.trim(),
        idCommessa = idCommessa,
        codiceProposto = if (idCommessa.isBlank() && commessa.isNotBlank()) codiceProposto else "",
        idProgetto = idProgetto,
        progetto = progetto,
        progettoDescrizione = progettoDescrizione,
        progettoIntestatoA = progettoIntestatoA,
        progettoNuovo = if (idProgetto.isBlank()) progettoNuovo else null,
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
        strumenti = strumenti,
    )

    /** Vero se c'e' qualcosa da salvare rispetto a com'era all'apertura. */
    val cambiato: Boolean
        get() = nuovo || fotoNuove.isNotEmpty() || rapportino().soloCompilato() != base.soloCompilato()

    /** Controlla solo i campi di un passo: Avanti non va oltre finché mancano. */
    fun validaPasso(n: Int, regole: Regole, chiediTariffa: Boolean = true): Boolean {
        val tutti = valida(regole, chiediTariffa)
        val delPasso = when (n) {
            1 -> setOf("cliente", "progetto")
            2 -> setOf("oreLavoro", "oreExtra", "oreViaggio", "km", "tariffa")
            3 -> setOf("descrizione", "spese")
            else -> errori.keys
        }
        errori = errori.filterKeys { it in delPasso }
        return tutti || errori.isEmpty()
    }

    /** Ore e km a passi di mezz'ora, mai sotto zero. */
    fun cambia(campo: String, delta: Double) {
        fun nuovo(t: String) = Numeri.scrivi(maxOf(0.0, Math.round(((Numeri.leggi(t) ?: 0.0) + delta) * 2) / 2.0), vuotoSeZero = true)
        when (campo) {
            "oreLavoro" -> oreLavoro = nuovo(oreLavoro)
            "oreExtra" -> oreExtra = nuovo(oreExtra)
            "oreViaggio" -> oreViaggio = nuovo(oreViaggio)
        }
        errori = errori - campo
    }

    /**
     * Controlla che il rapportino stia in piedi. Gli errori si scrivono sotto il
     * campo che li ha, con le parole di chi compila e non col nome del campo.
     *
     * @param chiediTariffa falso per chi non vede i soldi (dalla fase 1): la
     *        tariffa non la vede e non la scrive, la mette il server.
     */
    fun valida(regole: Regole, chiediTariffa: Boolean = true): Boolean {
        val e = mutableMapOf<String, String>()
        if (cliente.isBlank()) e["cliente"] = "Scegli il cliente"
        // Progetti accesi (progetti.md §4.5): per Elettrodinamica senza progetto il rapportino non si salva, e il progetto
        // vuole la commessa. Per gli altri clienti (06/11/2026) progetto e commessa sono facoltativi.
        else if (progettoRichiesto && idProgetto.isBlank() && progettoNuovo == null) {
            if (idCommessa.isBlank() && codiceProposto.isBlank()) e["cliente"] = "Scegli la commessa" else e["progetto"] = "Scegli il progetto"
        }
        if (descrizione.isBlank()) e["descrizione"] = "Scrivi che lavoro hai fatto"
        listOf("oreLavoro" to oreLavoro, "oreExtra" to oreExtra, "oreViaggio" to oreViaggio, "km" to km, "spese" to spese)
            .forEach { (campo, testo) ->
                if (testo.isNotBlank() && Numeri.leggi(testo) == null) e[campo] = "Non è un numero"
            }
        val ore = listOf(oreLavoro, oreExtra, oreViaggio).sumOf { Numeri.leggi(it) ?: 0.0 }
        if (ore <= 0.0 && "oreLavoro" !in e) e["oreLavoro"] = "Mancano le ore"
        if (chiediTariffa && regole.tariffaFissa == null && (Numeri.leggi(tariffa) ?: 0.0) <= 0.0) {
            e["tariffa"] = "Scrivi la tariffa oraria"
        }
        errori = e
        return e.isEmpty()
    }

    // ---- la copia su disco, se Android chiude l'app mentre si fa una foto ----

    fun aJson(): JSONObject = JSONObject()
        .put("nuovo", nuovo)
        .put("passo", passo)
        .put("tariffaToccata", tariffaToccata)
        .put("base", base.aJson())
        .put("rapportino", rapportino().aJson())
        .put("fotoNuove", JSONArray(fotoNuove.map { it.path }))

    companion object {
        fun daJson(o: JSONObject): ModuloStato {
            val base = Rapportino.daJson(o.getJSONObject("base"))
            val compilato = Rapportino.daJson(o.getJSONObject("rapportino"))
            return ModuloStato(compilato.copy(id = base.id, foto = base.foto, firma = base.firma, stato = base.stato),
                o.optBoolean("nuovo"), o.optBoolean("tariffaToccata"), o.optInt("passo", 1)).also { s ->
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
 * Il rapportino in corso (dal 06/11/2026 coi suoi lavori, [GiornataStato]), salvato su disco a ogni modifica.
 *
 * Fare la foto di uno scontrino apre la fotocamera, cioe' un'altra app, e su
 * un telefono con poca memoria Android puo' chiudere Wisper nel frattempo:
 * senza questa copia, al ritorno il rapportino a meta' sarebbe sparito. Il file
 * di prima (un modulo solo) si legge ancora: diventa un rapportino col lavoro aperto.
 */
class BozzaModulo(cartella: File) {
    private val file = File(cartella, "modulo-in-corso.json")

    fun esiste(): Boolean = file.exists()

    fun leggi(): GiornataStato? = runCatching { GiornataStato.daJson(JSONObject(file.readText())) }.getOrNull()

    fun scrivi(s: GiornataStato) {
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
