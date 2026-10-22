package eu.stgm.wisper.rapportino

import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

/*
 * Fase 4 (docs/gestionale/fase4.md, risposte in architettura.md §15): fatture,
 * bozze, passaggio al programma, ritorno dell'XML, note di credito, fatture
 * ricevute, banche e scadenze. Solo dati e regole: i conti veri li fa il server
 * (contiFattura in server/src/conti.js); [RegoleFattura] li rifà uguali per
 * l'anteprima mentre si cambia una bozza, coi casi di server/prove/casi-fattura.json.
 */

// ---------------------------------------------------------------------------------- i conti

/** Una riga come la vuole contiFattura: tipo compenso | anticipazione | bollo (saltata). */
data class RigaPerConti(
    val tipo: String,
    val quantita: Double? = null,
    val prezzo: Double? = null,
    val importo: Double? = null,
    val tributoCliente: Boolean = false,
)

/** I parametri fiscali congelati nella fattura (o quelli delle impostazioni, per una bozza nuova). */
data class ParametriFattura(
    val regime: String = "ordinario",
    val ivaPercentuale: Double = 22.0,
    val eppiPercentuale: Double = 5.0,
    val ritenutaPercentuale: Double = 20.0,
    /** Il cliente è sostituto d'imposta: trattiene la ritenuta. */
    val ritenuta: Boolean = true,
    val bolloSoglia: Double = 77.47,
    val bolloImporto: Double = 2.0,
    val bolloRivalsa: Boolean = true,
)

/** La risposta di contiFattura (fase4.md §6). */
data class ContiFattura(
    val righe: List<Double> = emptyList(),
    val compenso: Double = 0.0,
    val contributo: Double = 0.0,
    val baseIva: Double = 0.0,
    val iva: Double = 0.0,
    val anticipazioni: Double = 0.0,
    val parteSenzaIva: Double = 0.0,
    val bollo: Double = 0.0,
    val bolloAddebitato: Double = 0.0,
    val totale: Double = 0.0,
    val ritenuta: Double = 0.0,
    val netto: Double = 0.0,
) {
    companion object {
        fun daJson(o: JSONObject?): ContiFattura? = o?.let {
            ContiFattura(
                righe = it.optJSONArray("righe")?.let { a -> (0 until a.length()).map { i -> a.optDouble(i, 0.0) } }.orEmpty(),
                compenso = it.numero("compenso") ?: 0.0,
                contributo = it.numero("contributo") ?: 0.0,
                baseIva = it.numero("baseIva") ?: 0.0,
                iva = it.numero("iva") ?: 0.0,
                anticipazioni = it.numero("anticipazioni") ?: 0.0,
                parteSenzaIva = it.numero("parteSenzaIva") ?: 0.0,
                bollo = it.numero("bollo") ?: 0.0,
                bolloAddebitato = it.numero("bolloAddebitato") ?: 0.0,
                totale = it.numero("totale") ?: 0.0,
                ritenuta = it.numero("ritenuta") ?: 0.0,
                netto = it.numero("netto") ?: 0.0,
            )
        }
    }
}

/**
 * contiFattura() di server/src/conti.js, passo per passo: ogni pezzo al centesimo
 * (Math.round(n * 100) / 100 di JavaScript) prima di sommare, nello stesso ordine.
 */
object RegoleFattura {
    fun centesimi(n: Double): Double = Math.floor(n * 100 + 0.5) / 100.0

    /** importoRigaFattura(): l'importo se c'è, se no quantità × prezzo (quantità mancante 1, prezzo mancante 0). */
    fun importoRiga(r: RigaPerConti): Double {
        r.importo?.let { return centesimi(it) }
        val q = r.quantita ?: 1.0
        return centesimi(q * (r.prezzo ?: 0.0))
    }

    fun calcola(p: ParametriFattura, righe: List<RigaPerConti>): ContiFattura {
        val forfettario = p.regime == "forfettario"
        var compenso = 0.0
        var anticipazioni = 0.0
        var perIlBollo = 0.0
        val importi = ArrayList<Double>()
        for (r in righe) {
            if (r.tipo == "bollo") continue
            val importo = importoRiga(r)
            importi.add(importo)
            if (r.tipo == "anticipazione") {
                anticipazioni = centesimi(anticipazioni + importo)
                if (!r.tributoCliente) perIlBollo = centesimi(perIlBollo + importo)
            } else {
                compenso = centesimi(compenso + importo)
            }
        }
        val contributo = centesimi(compenso * p.eppiPercentuale / 100)
        val baseIva = if (forfettario) 0.0 else centesimi(compenso + contributo)
        val iva = if (forfettario) 0.0 else centesimi(baseIva * p.ivaPercentuale / 100)
        val parteSenzaIva = if (forfettario) centesimi(compenso + contributo + perIlBollo) else perIlBollo
        val bollo = if (parteSenzaIva > p.bolloSoglia) centesimi(p.bolloImporto) else 0.0
        val bolloAddebitato = if (p.bolloRivalsa) bollo else 0.0
        val totale = if (forfettario) centesimi(compenso + contributo + anticipazioni + bolloAddebitato)
        else centesimi(baseIva + iva + anticipazioni + bolloAddebitato)
        val ritenuta = if (!forfettario && p.ritenuta) centesimi(compenso * p.ritenutaPercentuale / 100) else 0.0
        return ContiFattura(importi, compenso, contributo, baseIva, iva, anticipazioni, parteSenzaIva, bollo, bolloAddebitato, totale, ritenuta, centesimi(totale - ritenuta))
    }

    /** I parametri di adesso dalle impostazioni (per l'anteprima: la fattura congela i suoi). */
    fun parametriDa(impostazioni: Map<String, String>, ritenuta: Boolean = true): ParametriFattura = ParametriFattura(
        regime = if (impostazioni["REGIME_FISCALE"]?.trim('"') == "RF19") "forfettario" else "ordinario",
        ivaPercentuale = Numeri.leggi(impostazioni["IVA"]) ?: 22.0,
        eppiPercentuale = Numeri.leggi(impostazioni["EPPI_INTEGRATIVO"]) ?: 5.0,
        ritenutaPercentuale = Numeri.leggi(impostazioni["RITENUTA"]) ?: 20.0,
        ritenuta = ritenuta,
        bolloSoglia = Numeri.leggi(impostazioni["BOLLO_SOGLIA"]) ?: 77.47,
        bolloImporto = Numeri.leggi(impostazioni["BOLLO_IMPORTO"]) ?: 2.0,
        bolloRivalsa = impostazioni["BOLLO_RIVALSA"]?.lowercase()?.let { it != "false" && it != "0" } ?: true,
    )
}

// ---------------------------------------------------------------------------------- aiuti

private fun JSONObject.listaTesti(campo: String): List<String> =
    optJSONArray(campo)?.let { a -> (0 until a.length()).mapNotNull { i -> if (a.isNull(i)) null else a.opt(i)?.toString() } }.orEmpty()

private fun JSONObject.mancano(): List<Mancanza> = optJSONArray("mancano").oggetti().map { Mancanza(it.testo("campo"), it.testo("testo")) }

private fun JSONObject.intero(campo: String): Int = numero(campo)?.toInt() ?: 0

private val DATA_IT = DateTimeFormatter.ofPattern("dd/MM/yyyy")
private val GIORNO_IT = DateTimeFormatter.ofPattern("EEEE d MMMM", Locale.ITALY)

/** "2026-10-22" -> "22/10/2026"; vuoto se non è una data. */
fun dataIt(iso: String): String = runCatching { LocalDate.parse(iso.take(10)).format(DATA_IT) }.getOrDefault(iso)

/** "2026-10-22" -> "22/10". */
fun dataBreve(iso: String): String = runCatching { LocalDate.parse(iso.take(10)).format(DateTimeFormatter.ofPattern("dd/MM")) }.getOrDefault(iso)

/** "2026-11-01" -> "domenica 1 novembre". */
fun giornoParole(iso: String): String = runCatching { LocalDate.parse(iso.take(10)).format(GIORNO_IT) }.getOrDefault(iso)

fun dataDi(iso: String): LocalDate? = runCatching { LocalDate.parse(iso.take(10)) }.getOrNull()

// ---------------------------------------------------------------------------------- da fatturare

/** Una cosa pronta da fatturare (§15.3). [chiave] = "tipo:id", unica nella pagina. */
data class VoceDaFatturare(
    val tipo: String,
    val id: String,
    val idCommessa: String = "",
    val data: String = "",
    val titolo: String = "",
    val dettaglio: String = "",
    val quando: String = "",
    val pronta: Boolean = true,
    val importo: Double = 0.0,
    val anticipazione: Boolean = false,
    val gruppo: String = "",
    val idRapportino: String = "",
    val spese: List<String> = emptyList(),
    val totaleConSpese: Double? = null,
    val senzaPrezzo: Boolean = false,
    val idCliente: String = "",
    val cliente: String = "",
) {
    val chiave: String get() = "$tipo:$id"

    fun perServer(): JSONObject = JSONObject().put("tipo", tipo).put("id", PonteServer.idJson(id))

    companion object {
        fun daJson(o: JSONObject, idCliente: String = "", cliente: String = "") = VoceDaFatturare(
            tipo = o.testo("tipo"),
            id = o.testo("id"),
            idCommessa = o.testo("idCommessa"),
            data = o.testo("data"),
            titolo = o.testo("titolo"),
            dettaglio = o.testo("dettaglio"),
            quando = o.testo("quando"),
            pronta = if (o.has("pronta")) o.vero("pronta") else true,
            importo = o.numero("importo") ?: 0.0,
            anticipazione = o.vero("anticipazione"),
            gruppo = o.testo("gruppo"),
            idRapportino = o.testo("idRapportino"),
            spese = o.listaTesti("spese"),
            totaleConSpese = o.numero("totaleConSpese"),
            senzaPrezzo = o.vero("senzaPrezzo"),
            idCliente = o.testo("idCliente").ifBlank { idCliente },
            cliente = o.testo("cliente").ifBlank { cliente },
        )
    }
}

data class GruppoDaFatturare(
    val idCliente: String,
    val cliente: String,
    val sostituto: Boolean,
    val mancano: List<Mancanza>,
    val totale: Double,
    val voci: List<VoceDaFatturare>,
)

data class FatturaInBozza(val idFattura: String, val riferimento: String, val idCliente: String, val cliente: String, val stato: String, val voci: Int, val totale: Double?)

data class RiepilogoInviato(val idCliente: String, val mese: String, val rapportini: Int, val inviatoIl: String)

data class RapportinoDaFirmare(val id: String, val idCliente: String, val cliente: String, val idCommessa: String, val data: String, val descrizione: String, val ore: Double)

data class DaFatturare(
    val oggi: String = "",
    val totale: Double = 0.0,
    val clienti: Int = 0,
    val gruppi: List<GruppoDaFatturare> = emptyList(),
    val piuAvanti: List<VoceDaFatturare> = emptyList(),
    val inBozza: List<FatturaInBozza> = emptyList(),
    val riepiloghi: List<RiepilogoInviato> = emptyList(),
    val raggruppa: Map<String, String> = emptyMap(),
    val daFirmare: List<RapportinoDaFirmare> = emptyList(),
) {
    /** Tutte le voci, anche quelle di Più avanti (si possono fatturare lo stesso). */
    val tutte: List<VoceDaFatturare> get() = gruppi.flatMap { it.voci } + piuAvanti

    fun voce(chiave: String): VoceDaFatturare? = tutte.firstOrNull { it.chiave == chiave }

    companion object {
        fun daJson(o: JSONObject): DaFatturare {
            val r = o.optJSONObject("raggruppa")
            return DaFatturare(
                oggi = o.testo("oggi"),
                totale = o.numero("totale") ?: 0.0,
                clienti = o.intero("clienti"),
                gruppi = o.optJSONArray("gruppi").oggetti().map { g ->
                    val id = g.testo("idCliente")
                    val nome = g.testo("cliente")
                    GruppoDaFatturare(id, nome, g.vero("sostituto"), g.mancano(), g.numero("totale") ?: 0.0,
                        g.optJSONArray("voci").oggetti().map { VoceDaFatturare.daJson(it, id, nome) })
                },
                piuAvanti = o.optJSONArray("piuAvanti").oggetti().map { VoceDaFatturare.daJson(it) },
                inBozza = o.optJSONArray("inBozza").oggetti().map {
                    FatturaInBozza(it.testo("idFattura"), it.testo("riferimento"), it.testo("idCliente"), it.testo("cliente"), it.testo("stato"), it.intero("voci"), it.numero("totale"))
                },
                riepiloghi = o.optJSONArray("riepiloghi").oggetti().map { RiepilogoInviato(it.testo("idCliente"), it.testo("mese"), it.intero("rapportini"), it.testo("inviatoIl")) },
                raggruppa = r?.keys()?.asSequence()?.associateWith { r.testo(it) }.orEmpty(),
                daFirmare = o.optJSONArray("daFirmare").oggetti().map {
                    RapportinoDaFirmare(it.testo("id"), it.testo("idCliente"), it.testo("cliente"), it.testo("idCommessa"), it.testo("data"), it.testo("descrizione"), it.numero("ore") ?: 0.0)
                },
            )
        }
    }
}

/**
 * Le regole della scelta in Da fatturare (fase4.md §13.2, §15.3): una fattura è per
 * un cliente solo; le spese di un rapportino vanno con lui (scegliere una spesa porta
 * il rapportino e le altre sue spese, toglierne una toglie tutto il rapportino).
 */
object SceltaDaFatturare {
    data class Esito(val scelte: Set<String>, val avviso: String? = null)

    const val UN_CLIENTE = "Una fattura è per un cliente solo: ho tolto le altre"

    /**
     * Le chiavi che vanno insieme a [v]: il rapportino e tutte le sue spese. Dalla
     * fase 5 (§16.14) anche il ticket "una riga" e le sue spese anticipate, che hanno
     * lo stesso gruppo `ticket:{numero}`: scegliere il ticket le porta, sceglierne una porta il ticket.
     */
    fun insieme(v: VoceDaFatturare, tutte: List<VoceDaFatturare>): Set<String> {
        if (v.gruppo.startsWith("ticket:")) return (tutte.filter { it.gruppo == v.gruppo }.map { it.chiave } + v.chiave).toSet()
        val idRap = when {
            v.tipo == "rapportino" -> v.id
            v.tipo == "spesa" && v.idRapportino.isNotBlank() -> v.idRapportino
            else -> return setOf(v.chiave)
        }
        val rap = tutte.firstOrNull { it.tipo == "rapportino" && it.id == idRap }
        val spese = tutte.filter { it.tipo == "spesa" && it.idRapportino == idRap }.map { it.chiave }
        return (listOfNotNull(rap?.chiave) + spese + v.chiave).toSet()
    }

    fun cambia(scelte: Set<String>, voce: VoceDaFatturare, tutte: List<VoceDaFatturare>): Esito = cambia(scelte, listOf(voce), tutte)

    /** Spunta o toglie [voci] insieme (un mese di rapportini): se c'erano tutte si tolgono, se no si mettono. */
    fun cambia(scelte: Set<String>, voci: List<VoceDaFatturare>, tutte: List<VoceDaFatturare>): Esito {
        if (voci.isEmpty()) return Esito(scelte)
        val chiavi = voci.flatMap { insieme(it, tutte) }.toSet()
        if (chiavi.all { it in scelte }) return Esito(scelte - chiavi)
        val cliente = voci.first().idCliente
        val altri = scelte.filter { k -> tutte.firstOrNull { it.chiave == k }?.idCliente.let { it != null && it != cliente } }.toSet()
        return Esito((scelte - altri) + chiavi, if (altri.isNotEmpty()) UN_CLIENTE else null)
    }

    /** Il totale da mostrare sul pulsante: la somma delle voci scelte (ogni spesa è una voce sua). */
    fun totale(scelte: Set<String>, tutte: List<VoceDaFatturare>): Double =
        RegoleFattura.centesimi(tutte.filter { it.chiave in scelte }.distinctBy { it.chiave }.sumOf { it.importo })

    fun cliente(scelte: Set<String>, tutte: List<VoceDaFatturare>): String? = tutte.firstOrNull { it.chiave in scelte }?.idCliente
}

// ---------------------------------------------------------------------------------- la fattura

data class RigaFattura(
    val id: String = "",
    val ordine: Int = 0,
    val origine: String = "bozza",
    val gruppo: String = "",
    val tipo: String = "compenso",
    val descrizione: String = "",
    val quantita: Double? = 1.0,
    val unita: String = "",
    val prezzo: Double? = null,
    val importo: Double = 0.0,
    val aliquotaIva: Double = 22.0,
    val natura: String = "",
    val ritenuta: Boolean = false,
    val tributoCliente: Boolean = false,
    val idCommessa: String = "",
    val importoSorgenti: Double? = null,
) {
    val bollo: Boolean get() = tipo == "bollo"

    /** Una riga di un gruppo con l'importo cambiato: "era 317,88". */
    val cambiata: Boolean get() = importoSorgenti != null && gruppo.isNotBlank() && Math.abs(importoSorgenti - importo) >= 0.005

    fun perConti(ricalcola: Boolean): RigaPerConti =
        if (!ricalcola && gruppo.isNotBlank()) RigaPerConti(tipo, quantita, prezzo, importo, tributoCliente)
        else RigaPerConti(tipo, quantita, prezzo, null, tributoCliente)

    fun perSalvare(): JSONObject {
        val o = JSONObject().put("tipo", tipo).put("descrizione", descrizione.trim())
            .put("quantita", quantita ?: JSONObject.NULL).put("unita", unita.trim())
            .put("prezzo", prezzo ?: JSONObject.NULL).put("tributoCliente", tributoCliente)
        if (id.isNotBlank() && !id.startsWith(PonteServer.NUOVO)) o.put("id", PonteServer.idJson(id))
        return o
    }

    companion object {
        fun daJson(o: JSONObject) = RigaFattura(
            id = o.testo("id"),
            ordine = o.intero("ordine"),
            origine = o.testo("origine").ifBlank { "bozza" },
            gruppo = o.testo("gruppo"),
            tipo = o.testo("tipo").ifBlank { "compenso" },
            descrizione = o.testo("descrizione"),
            quantita = o.numero("quantita"),
            unita = o.testo("unita"),
            prezzo = o.numero("prezzo"),
            importo = o.numero("importo") ?: 0.0,
            aliquotaIva = o.numero("aliquotaIva") ?: 0.0,
            natura = o.testo("natura"),
            ritenuta = o.vero("ritenuta"),
            tributoCliente = o.vero("tributoCliente"),
            idCommessa = o.testo("idCommessa"),
            importoSorgenti = o.numero("importoSorgenti"),
        )
    }
}

data class SorgenteFattura(val tipo: String, val id: String, val gruppo: String, val descrizione: String, val importo: Double?, val attiva: Boolean, val liberataPerche: String = "")

data class RataFattura(val id: String, val data: String, val importo: Double, val modalita: String, val coperta: Double)

/** Un incasso di una fattura o un pagamento di una ricevuta (un abbinamento a un movimento). */
data class Incasso(val idMovimento: String, val data: String, val importo: Double, val conto: String, val verificato: Boolean) {
    companion object {
        fun daJson(o: JSONObject) = Incasso(o.testo("idMovimento"), o.testo("data"), o.numero("importo") ?: 0.0, o.testo("conto"), o.vero("verificato"))
    }
}

data class NotaCollegata(val id: String, val numero: String, val data: String, val totale: Double?, val netto: Double?, val stato: String)

data class AvvisoFattura(val tipo: String, val testo: String)

data class FileFattura(val id: String, val url: String, val nome: String)

/** Una fattura o una nota di credito (§15.4). [grezzo] è la risposta com'è arrivata. */
data class Fattura(
    val id: String,
    val riferimento: String = "",
    val etichetta: String = "",
    val tipo: String = "fattura",
    val tipoDocumento: String = "TD01",
    val idCliente: String = "",
    val cliente: String = "",
    val idCommessa: String = "",
    val idFatturaCollegata: String = "",
    val stato: String = "bozza",
    val statoVisto: String = "Bozza",
    val pagamento: String = "",
    val scaduta: Boolean = false,
    val giorniScaduta: Int = 0,
    val data: String = "",
    val numero: String = "",
    val numeroDa: String = "",
    val causale: String = "",
    val noteInterne: String = "",
    val parametri: ParametriFattura = ParametriFattura(),
    val conti: ContiFattura? = null,
    val totaleBozza: Double? = null,
    val nettoBozza: Double? = null,
    val scadenze: List<RataFattura> = emptyList(),
    val scadenzaAMano: Boolean = false,
    val idConto: String = "",
    val conto: String = "",
    val incassato: Double? = null,
    val residuo: Double? = null,
    /** Soldi già incassati da restituire o compensare dopo una nota di credito (architettura.md, correzioni del 22/10). */
    val daRestituire: Double? = null,
    val daEmettereEntro: String = "",
    val esitoSdi: String = "",
    val prontaIl: String = "",
    val emessaIl: String = "",
    val avvisoInviatoIl: String = "",
    val regoleConfermate: Boolean = false,
    val righe: List<RigaFattura> = emptyList(),
    val sorgenti: List<SorgenteFattura> = emptyList(),
    val incassi: List<Incasso> = emptyList(),
    val note: List<NotaCollegata> = emptyList(),
    val fatturaCollegata: String = "",
    val file: FileFattura? = null,
    val modificabile: Boolean = false,
    val mancano: List<Mancanza> = emptyList(),
    val puoScrivere: Boolean = false,
    val avvisi: List<AvvisoFattura> = emptyList(),
    /** Nota in bozza appena preparata: i gruppi che tornerebbero da fatturare. */
    val tornanoDaFatturare: List<String> = emptyList(),
    val grezzo: JSONObject? = null,
) {
    val nota: Boolean get() = tipo == "nota"
    val bozza: Boolean get() = stato == "bozza"
    val pronta: Boolean get() = stato == "pronta"
    val emessa: Boolean get() = stato == "emessa"
    val pagata: Boolean get() = pagamento == "pagata"

    /** "45/2026" o "Rif. W-15" (in grigio) per gli elenchi. */
    val numeroVisto: String get() = numero.ifBlank { "Rif. $riferimento" }

    /** La prima rata non ancora coperta per intero (o la prima). */
    val scadenza: String get() = (scadenze.firstOrNull { it.coperta + 0.005 < it.importo } ?: scadenze.firstOrNull())?.data.orEmpty()

    companion object {
        fun daJson(o: JSONObject): Fattura {
            val conti = ContiFattura.daJson(o.optJSONObject("conti"))
            val file = o.optJSONObject("file")
            return Fattura(
                id = o.testo("id"),
                riferimento = o.testo("riferimento"),
                etichetta = o.testo("etichetta"),
                tipo = o.testo("tipo").ifBlank { "fattura" },
                tipoDocumento = o.testo("tipoDocumento"),
                idCliente = o.testo("idCliente"),
                cliente = o.testo("cliente"),
                idCommessa = o.testo("idCommessa"),
                idFatturaCollegata = o.testo("idFatturaCollegata"),
                stato = o.testo("stato").ifBlank { "bozza" },
                statoVisto = o.testo("statoVisto"),
                pagamento = o.testo("pagamento"),
                scaduta = o.vero("scaduta"),
                giorniScaduta = o.intero("giorniScaduta"),
                data = o.testo("data"),
                numero = o.testo("numero"),
                numeroDa = o.testo("numeroDa"),
                causale = o.testo("causale"),
                noteInterne = o.testo("noteInterne"),
                parametri = ParametriFattura(
                    regime = o.testo("regime").ifBlank { "ordinario" },
                    ivaPercentuale = o.numero("ivaPercentuale") ?: 22.0,
                    eppiPercentuale = o.numero("eppiPercentuale") ?: 5.0,
                    ritenutaPercentuale = o.numero("ritenutaPercentuale") ?: 20.0,
                    ritenuta = o.vero("ritenuta"),
                    // La risposta non porta soglia e importo del bollo congelati: per l'anteprima
                    // si usano quelli delle impostazioni (vedi ServizioFase4.anteprima).
                    bolloSoglia = o.numero("bolloSoglia") ?: 77.47,
                    bolloImporto = o.numero("bolloImporto") ?: (conti?.bollo?.takeIf { it > 0 } ?: 2.0),
                    bolloRivalsa = if (o.has("bolloRivalsa")) o.vero("bolloRivalsa") else true,
                ),
                conti = conti,
                totaleBozza = o.numero("totaleBozza"),
                nettoBozza = o.numero("nettoBozza"),
                scadenze = o.optJSONArray("scadenze").oggetti().map { RataFattura(it.testo("id"), it.testo("data"), it.numero("importo") ?: 0.0, it.testo("modalita"), it.numero("coperta") ?: 0.0) },
                scadenzaAMano = o.vero("scadenzaAMano"),
                idConto = o.testo("idConto"),
                conto = o.testo("conto"),
                incassato = o.numero("incassato"),
                residuo = o.numero("residuo"),
                daRestituire = o.numero("daRestituire"),
                daEmettereEntro = o.testo("daEmettereEntro"),
                esitoSdi = o.testo("esitoSdi"),
                prontaIl = o.testo("prontaIl"),
                emessaIl = o.testo("emessaIl"),
                avvisoInviatoIl = o.testo("avvisoInviatoIl"),
                regoleConfermate = o.vero("regoleConfermate"),
                righe = o.optJSONArray("righe").oggetti().map(RigaFattura::daJson),
                sorgenti = o.optJSONArray("sorgenti").oggetti().map {
                    SorgenteFattura(it.testo("tipo"), it.testo("id"), it.testo("gruppo"), it.testo("descrizione"), it.numero("importo"), it.vero("attiva"), it.testo("liberataPerche"))
                },
                incassi = o.optJSONArray("incassi").oggetti().map(Incasso::daJson),
                note = o.optJSONArray("note").oggetti().map { NotaCollegata(it.testo("id"), it.testo("numero"), it.testo("data"), it.numero("totale"), it.numero("netto"), it.testo("stato")) },
                fatturaCollegata = o.optJSONObject("fatturaCollegata")?.let { c -> listOf(c.testo("numero"), dataIt(c.testo("data"))).filter { it.isNotBlank() }.joinToString(" del ") }.orEmpty(),
                file = file?.let { FileFattura(it.testo("id"), it.testo("url"), it.testo("nome")) },
                modificabile = o.vero("modificabile"),
                mancano = o.mancano(),
                puoScrivere = o.vero("puoScrivere"),
                avvisi = o.optJSONArray("avvisi").oggetti().map { AvvisoFattura(it.testo("tipo"), it.testo("testo")) },
                tornanoDaFatturare = o.optJSONArray("tornanoDaFatturare").oggetti().flatMap { g -> g.optJSONArray("sorgenti").oggetti().map { it.testo("descrizione") } },
                grezzo = o,
            )
        }
    }
}

/** I filtri dell'elenco delle fatture (§15.4). */
data class FiltroFatture(val stato: String = "", val pagamento: String = "", val scadute: Boolean = false, val tipo: String = "", val testo: String = "", val idCliente: String = "", val idCommessa: String = "") {
    fun parametri(): List<Pair<String, String>> = buildList {
        if (stato.isNotBlank()) add("stato" to stato)
        if (pagamento.isNotBlank()) add("pagamento" to pagamento)
        if (scadute) add("scadute" to "true")
        if (tipo.isNotBlank()) add("tipo" to tipo)
        if (testo.isNotBlank()) add("testo" to testo)
        if (idCliente.isNotBlank()) add("idCliente" to idCliente)
        if (idCommessa.isNotBlank()) add("idCommessa" to idCommessa)
    }
}

// ---------------------------------------------------------------------------------- il pacchetto

data class CampoProspetto(val etichetta: String, val valore: String)
data class SezioneProspetto(val titolo: String, val campi: List<CampoProspetto>)

/** Il pacchetto del passaggio al programma (§15.6): il modello, il prospetto e l'XML da completare. */
data class Pacchetto(
    val uscite: List<String>,
    val modello: JSONObject,
    val mancano: List<Mancanza>,
    val titolo: String,
    val avviso: String,
    val sezioni: List<SezioneProspetto>,
    val testo: String,
    val xmlNome: String = "",
    val xmlBase64: String = "",
) {
    val conXml: Boolean get() = "xml" in uscite && xmlBase64.isNotBlank()
    val conProspetto: Boolean get() = "prospetto" in uscite

    companion object {
        fun daJson(o: JSONObject): Pacchetto {
            val p = o.optJSONObject("prospetto") ?: JSONObject()
            val x = o.optJSONObject("xml")
            return Pacchetto(
                uscite = o.listaTesti("uscite"),
                modello = o.optJSONObject("modello") ?: JSONObject(),
                mancano = o.mancano(),
                titolo = p.testo("titolo").ifBlank { "Prospetto per il programma delle fatture" },
                avviso = p.testo("avviso"),
                sezioni = p.optJSONArray("sezioni").oggetti().map { s ->
                    SezioneProspetto(s.testo("titolo"), s.optJSONArray("campi").oggetti().map { CampoProspetto(it.testo("etichetta"), it.testo("valore")) })
                },
                testo = p.testo("testo"),
                xmlNome = x?.testo("nome").orEmpty(),
                xmlBase64 = x?.testo("base64").orEmpty(),
            )
        }

        /**
         * Il nome con cui si salva l'XML da completare: quello del server, che dice di
         * non inviarlo; ripulito dai caratteri che Android non vuole, senza mai la forma
         * IT..._....xml dei file da trasmettere.
         */
        fun nomeXmlSicuro(nome: String, riferimento: String): String {
            var n = nome.replace(Regex("""[\\/:*?"<>|]"""), "-").trim()
            if (n.isBlank()) n = "Bozza $riferimento - non inviare.xml"
            if (!n.contains("non inviare", ignoreCase = true)) n = n.removeSuffix(".xml") + " - non inviare.xml"
            if (Regex("""^IT\w+_\w+""", RegexOption.IGNORE_CASE).containsMatchIn(n)) n = "Bozza $n"
            if (!n.endsWith(".xml", ignoreCase = true)) n += ".xml"
            return n
        }
    }
}

// ---------------------------------------------------------------------------------- il ritorno dell'XML

data class Differenza(val campo: String, val bozza: Double?, val xml: Double?)
data class RigaMancante(val idRiga: String, val descrizione: String, val importo: Double?, val tipo: String, val gruppo: String)
data class Collegabile(val gruppo: String, val titolo: String, val importo: Double?, val voci: List<Pair<String, String>>, val spuntato: Boolean)
data class Alternativa(val idFattura: String, val riferimento: String, val totale: Double?)
data class GruppoNota(val gruppo: String, val descrizione: String, val importo: Double?)

data class PropostaXml(
    val azione: String = "",
    val certezza: String = "",
    val idFattura: String = "",
    val riferimento: String = "",
    val numero: String = "",
    val alternative: List<Alternativa> = emptyList(),
    val differenze: List<Differenza> = emptyList(),
    val righeMancanti: List<RigaMancante> = emptyList(),
    val collegabili: List<Collegabile> = emptyList(),
    val libera: List<String> = emptyList(),
    val categoria: String = "",
    val idSpesa: String = "",
    val gruppiFattura: List<GruppoNota> = emptyList(),
    val totale: Boolean? = null,
) {
    companion object {
        fun daJson(o: JSONObject?): PropostaXml {
            if (o == null) return PropostaXml()
            return PropostaXml(
                azione = o.testo("azione"),
                certezza = o.testo("certezza"),
                idFattura = o.testo("idFattura"),
                riferimento = o.testo("riferimento"),
                numero = o.testo("numero"),
                alternative = o.optJSONArray("alternative").oggetti().map { Alternativa(it.testo("idFattura"), it.testo("riferimento"), it.numero("totale")) },
                differenze = o.optJSONArray("differenze").oggetti().map { Differenza(it.testo("campo"), it.numero("bozza"), it.numero("xml")) },
                righeMancanti = o.optJSONArray("righeMancanti").oggetti().map { RigaMancante(it.testo("idRiga"), it.testo("descrizione"), it.numero("importo"), it.testo("tipo"), it.testo("gruppo")) },
                collegabili = o.optJSONArray("collegabili").oggetti().map { c ->
                    Collegabile(c.testo("gruppo"), c.testo("titolo"), c.numero("importo"), c.optJSONArray("voci").oggetti().map { it.testo("tipo") to it.testo("id") }, c.vero("spuntato"))
                },
                libera = o.listaTesti("libera"),
                categoria = o.testo("categoria"),
                idSpesa = o.testo("idSpesa"),
                gruppiFattura = o.optJSONArray("gruppiFattura").oggetti().map { GruppoNota(it.testo("gruppo"), it.testo("descrizione"), it.numero("importo")) },
                totale = o.booleanoONull("totale"),
            )
        }
    }
}

data class DocumentoXml(
    val chiave: String,
    val nomeFile: String = "",
    /** emessa | ricevuta | esito. */
    val tipo: String = "",
    val tipoDocumento: String = "",
    val numero: String = "",
    val data: String = "",
    val controparte: String = "",
    val idSoggetto: String = "",
    val totale: Double? = null,
    val netto: Double? = null,
    val compenso: Double? = null,
    val esito: String = "",
    val nomeFileFattura: String = "",
    val errori: List<String> = emptyList(),
    val proposta: PropostaXml = PropostaXml(),
    val avvisi: List<String> = emptyList(),
    val clienteNuovo: Boolean = false,
    val fornitoreNuovo: Boolean = false,
    val fatturaCollegata: String = "",
) {
    val nota: Boolean get() = tipoDocumento == "TD04"

    /**
     * L'XML da completare fatto da Wisper (Numero "BOZZA", il nome che dice di non
     * inviarlo) ricaricato per sbaglio: non è una fattura emessa dal programma. Il server
     * oggi lo propone come "certa" (vedi il resoconto della fase 4): il telefono lo salta
     * sempre, così una bozza non diventa mai "emessa" col numero BOZZA.
     */
    val bozzaDiWisper: Boolean
        get() = tipo == "emessa" && (numero.trim().equals("BOZZA", ignoreCase = true) || nomeFile.contains("non inviare", ignoreCase = true))

    /** "Fattura 46/2026", "Nota di credito 3/2026", "Fattura ricevuta 1301", "Esito della 45/2026". */
    val cosa: String
        get() = when (tipo) {
            "ricevuta" -> (if (nota) "Nota di credito ricevuta " else "Fattura ricevuta ") + numero
            "esito" -> "Esito dello SDI"
            else -> (if (nota) "Nota di credito " else "Fattura ") + numero
        }

    companion object {
        fun daJson(o: JSONObject): DocumentoXml {
            val c = o.optJSONObject("conti")
            val cp = o.optJSONObject("controparte")
            return DocumentoXml(
                chiave = o.testo("chiave"),
                nomeFile = o.testo("nomeFile"),
                tipo = o.testo("tipo"),
                tipoDocumento = o.testo("tipoDocumento"),
                numero = o.testo("numero"),
                data = o.testo("data"),
                controparte = cp?.testo("nome").orEmpty(),
                idSoggetto = cp?.testo("idSoggetto").orEmpty(),
                totale = c?.numero("totale"),
                netto = c?.numero("netto"),
                compenso = c?.numero("compenso"),
                esito = o.testo("esito"),
                nomeFileFattura = o.testo("nomeFileFattura"),
                errori = o.optJSONArray("errori").oggetti().map { listOf(it.testo("codice"), it.testo("descrizione")).filter { s -> s.isNotBlank() }.joinToString(" ") },
                proposta = PropostaXml.daJson(o.optJSONObject("proposta")),
                avvisi = o.listaTesti("avvisi"),
                clienteNuovo = o.optJSONObject("clienteNuovo") != null,
                fornitoreNuovo = o.optJSONObject("fornitoreNuovo") != null,
                fatturaCollegata = o.optJSONObject("fatturaCollegata")?.testo("numero").orEmpty(),
            )
        }
    }
}

data class FileScartato(val nomeFile: String, val motivo: String)

data class LetturaXml(val idLettura: String, val scade: String, val documenti: List<DocumentoXml>, val scartati: List<FileScartato>) {
    companion object {
        fun daJson(o: JSONObject) = LetturaXml(
            idLettura = o.testo("idLettura"),
            scade = o.testo("scade"),
            documenti = o.optJSONArray("documenti").oggetti().map(DocumentoXml::daJson),
            scartati = o.optJSONArray("scartati").oggetti().map { FileScartato(it.testo("nomeFile"), it.testo("motivo")) },
        )
    }
}

/**
 * La scelta per un documento letto: l'azione e i suoi dettagli. Niente si abbina
 * senza conferma (fase4.md §9.3): [confermata] falsa = il documento si salta.
 */
data class SceltaXml(
    val chiave: String,
    /** abbina | senzaBozza | nuova | salta. */
    val azione: String,
    val idFattura: String = "",
    val creaCliente: Boolean = false,
    val collega: List<Pair<String, String>> = emptyList(),
    val libera: List<String> = emptyList(),
    val idSpesa: String = "",
    val categoria: String = "",
    /** Pronta da mandare: le proposte sicure lo sono già; una "Diversa" o con più bozze uguali aspetta la scelta. */
    val confermata: Boolean = false,
) {
    fun perServer(): JSONObject {
        val o = JSONObject().put("chiave", chiave).put("azione", azione)
        if (idFattura.isNotBlank()) o.put("idFattura", PonteServer.idJson(idFattura))
        if (creaCliente) o.put("creaCliente", true)
        if (collega.isNotEmpty()) o.put("collega", JSONArray().apply { collega.forEach { (t, id) -> put(JSONObject().put("tipo", t).put("id", PonteServer.idJson(id))) } })
        if (libera.isNotEmpty()) o.put("libera", JSONArray(libera))
        if (idSpesa.isNotBlank()) o.put("idSpesa", PonteServer.idJson(idSpesa))
        if (categoria.isNotBlank()) o.put("categoria", categoria)
        return o
    }

    companion object {
        /**
         * La scelta di partenza dalla proposta del server:
         *  - Sicura: abbina, già confermata (è solo già scelta: si può cambiare);
         *  - Probabile con una sola bozza uguale: abbina, confermata; con altre uguali
         *    ([PropostaXml.alternative]) aspetta che si scelga la bozza;
         *  - Diversa: non confermata finché non si sceglie "Abbina lo stesso" o altro;
         *  - Senza bozza: registra senza bozza coi collegabili già spuntati, confermata;
         *  - ricevuta nuova: aggiungi, confermata; già importata ed esiti senza fattura: salta.
         */
        fun iniziale(d: DocumentoXml): SceltaXml {
            val p = d.proposta
            return when {
                d.bozzaDiWisper -> SceltaXml(d.chiave, "salta", confermata = true)
                p.azione == "gia" || p.azione == "salta" -> SceltaXml(d.chiave, "salta", confermata = true)
                d.tipo == "esito" -> SceltaXml(d.chiave, "abbina", idFattura = p.idFattura, confermata = p.idFattura.isNotBlank())
                d.tipo == "ricevuta" -> SceltaXml(d.chiave, "nuova", idSpesa = p.idSpesa, categoria = p.categoria, confermata = true)
                p.azione == "abbina" && p.certezza == "certa" -> SceltaXml(d.chiave, "abbina", idFattura = p.idFattura, libera = p.libera, confermata = true)
                p.azione == "abbina" && p.certezza == "probabile" ->
                    SceltaXml(d.chiave, "abbina", idFattura = p.idFattura, libera = p.libera, confermata = p.alternative.isEmpty())
                p.azione == "abbina" -> SceltaXml(d.chiave, "abbina", idFattura = p.idFattura, libera = p.libera, confermata = false)
                p.azione == "senzaBozza" -> SceltaXml(
                    d.chiave, "senzaBozza",
                    creaCliente = d.idSoggetto.isBlank() && d.clienteNuovo,
                    collega = p.collegabili.filter { it.spuntato }.flatMap { it.voci },
                    libera = p.libera,
                    confermata = d.idSoggetto.isNotBlank() || d.clienteNuovo,
                )
                else -> SceltaXml(d.chiave, "salta", confermata = true)
            }
        }

        /** Quelle da mandare: confermate e non saltate. */
        fun daMandare(scelte: Collection<SceltaXml>): List<SceltaXml> = scelte.filter { it.confermata && it.azione != "salta" }
    }
}

/** Quello che torna da confermaXml (§15.7). */
data class EsitoConferma(val abbinate: Int, val nuove: Int, val ricevute: Int, val note: Int, val esiti: Int, val saltate: Int, val avvisi: List<String>) {
    val frase: String
        get() = listOfNotNull(
            if (abbinate > 0) (if (abbinate == 1) "1 fattura abbinata" else "$abbinate fatture abbinate") else null,
            if (nuove > 0) (if (nuove == 1) "1 fattura registrata senza bozza" else "$nuove fatture registrate senza bozza") else null,
            if (note > 0) (if (note == 1) "1 nota di credito" else "$note note di credito") else null,
            if (ricevute > 0) (if (ricevute == 1) "1 fattura ricevuta" else "$ricevute fatture ricevute") else null,
            if (esiti > 0) (if (esiti == 1) "1 esito dello SDI" else "$esiti esiti dello SDI") else null,
        ).joinToString(", ").ifBlank { "Niente da registrare" }

    companion object {
        fun daJson(o: JSONObject): EsitoConferma {
            val c = o.optJSONObject("conteggi") ?: JSONObject()
            return EsitoConferma(c.intero("abbinate"), c.intero("nuove"), c.intero("ricevute"), c.intero("note"), c.intero("esiti"), c.intero("saltate"), o.listaTesti("avvisi"))
        }
    }
}

// ---------------------------------------------------------------------------------- ricevute

data class Ricevuta(
    val id: String,
    val idFornitore: String = "",
    val fornitore: String = "",
    val tipoDocumento: String = "",
    val numero: String = "",
    val data: String = "",
    val descrizione: String = "",
    val categoria: String = "",
    val idCommessa: String = "",
    val commessa: String = "",
    val imponibile: Double? = null,
    val iva: Double? = null,
    val totale: Double? = null,
    val ritenuta: Double? = null,
    val netto: Double? = null,
    val pagato: Double? = null,
    val daPagare: Double? = null,
    val stato: String = "",
    val statoVisto: String = "",
    val scaduta: Boolean = false,
    val giorniScaduta: Int = 0,
    val scadenze: List<RataFattura> = emptyList(),
    val scadenzaStimata: Boolean = false,
    val pagamenti: List<Incasso> = emptyList(),
    val origine: String = "",
    val note: String = "",
    val puoScrivere: Boolean = false,
) {
    val scadenza: String get() = (scadenze.firstOrNull { it.coperta + 0.005 < it.importo } ?: scadenze.firstOrNull())?.data.orEmpty()

    companion object {
        val CATEGORIE = listOf("materiale" to "Materiale", "consulenze" to "Consulenze", "servizi" to "Servizi", "utenze" to "Utenze", "affitto" to "Affitto", "altro" to "Altro")
        fun nomeCategoria(c: String) = CATEGORIE.firstOrNull { it.first == c }?.second ?: c.replaceFirstChar { it.uppercase() }

        fun daJson(o: JSONObject) = Ricevuta(
            id = o.testo("id"),
            idFornitore = o.testo("idFornitore"),
            fornitore = o.testo("fornitore"),
            tipoDocumento = o.testo("tipoDocumento"),
            numero = o.testo("numero"),
            data = o.testo("data"),
            descrizione = o.testo("descrizione"),
            categoria = o.testo("categoria"),
            idCommessa = o.testo("idCommessa"),
            commessa = o.testo("commessa"),
            imponibile = o.numero("imponibile"),
            iva = o.numero("iva"),
            totale = o.numero("totale"),
            ritenuta = o.numero("ritenuta"),
            netto = o.numero("netto"),
            pagato = o.numero("pagato"),
            daPagare = o.numero("daPagare"),
            stato = o.testo("stato"),
            statoVisto = o.testo("statoVisto"),
            scaduta = o.vero("scaduta"),
            giorniScaduta = o.intero("giorniScaduta"),
            scadenze = o.optJSONArray("scadenze").oggetti().map { RataFattura(it.testo("id"), it.testo("data"), it.numero("importo") ?: 0.0, it.testo("modalita"), it.numero("coperta") ?: 0.0) },
            scadenzaStimata = o.vero("scadenzaStimata"),
            pagamenti = o.optJSONArray("pagamenti").oggetti().map(Incasso::daJson),
            origine = o.testo("origine"),
            note = o.testo("note"),
            puoScrivere = o.vero("puoScrivere"),
        )
    }
}

// ---------------------------------------------------------------------------------- scadenze delle commesse e riepilogo

data class ScadenzaCommessa(
    val id: String, val idCommessa: String, val commessa: String, val idCliente: String, val cliente: String, val contratto: String,
    val descrizione: String, val quando: String, val data: String, val importo: Double?, val stato: String, val idFattura: String, val fattura: String, val fuoriDaWisper: Boolean,
) {
    /** La parola dello stato (§13.3): Prevista · In bozza · Fatturata 45/2026 · Incassata. */
    val statoVisto: String
        get() = when (stato) {
            "in_bozza" -> "In bozza" + if (fattura.isNotBlank()) " $fattura" else ""
            "fatturata" -> if (fuoriDaWisper) "Fatturata fuori da Wisper" else "Fatturata" + if (fattura.isNotBlank()) " $fattura" else ""
            "incassata" -> "Incassata"
            else -> "Prevista"
        }

    companion object {
        fun daJson(o: JSONObject) = ScadenzaCommessa(
            o.testo("id"), o.testo("idCommessa"), o.testo("commessa"), o.testo("idCliente"), o.testo("cliente"), o.testo("contratto"),
            o.testo("descrizione"), o.testo("quando"), o.testo("data"), o.numero("importo"), o.testo("stato"), o.testo("idFattura"), o.testo("fattura"), o.vero("fuoriDaWisper"),
        )

        /** "a fine progetto", "alla firma", "a fine lavori", "il 15/11/2026". */
        fun quandoParole(quando: String, data: String): String = when (quando) {
            "firma" -> "alla firma"
            "avanzamento" -> "a fine progetto"
            "fine" -> "a fine lavori"
            "data" -> if (data.isNotBlank()) "il " + dataIt(data) else "a una data"
            else -> if (data.isNotBlank()) dataIt(data) else ""
        }
    }
}

data class FatturazioneCommessa(
    val idCommessa: String, val modoFatturazione: String, val contratto: Double?, val fatturato: Double?, val incassato: Double?,
    val daFatturare: Double?, val inBozza: Double?, val previsto: Double?, val scadenze: List<ScadenzaCommessa>, val fatture: List<Fattura>,
) {
    companion object {
        fun daJson(o: JSONObject) = FatturazioneCommessa(
            o.testo("idCommessa"), o.testo("modoFatturazione"), o.numero("contratto"), o.numero("fatturato"), o.numero("incassato"),
            o.numero("daFatturare"), o.numero("inBozza"), o.numero("previsto"),
            o.optJSONArray("scadenze").oggetti().map(ScadenzaCommessa::daJson), o.optJSONArray("fatture").oggetti().map(Fattura::daJson),
        )

        fun modoParole(m: String) = when (m) {
            "corpo" -> "A corpo"
            "misto" -> "Misto"
            else -> "A ore"
        }
    }
}

data class RigaRiepilogo(
    val chiave: String, val nome: String, val fatture: Int, val compenso: Double?, val contributo: Double?, val iva: Double?,
    val anticipazioni: Double?, val totale: Double?, val ritenute: Double?, val incassato: Double?,
) {
    companion object {
        fun daJson(o: JSONObject) = RigaRiepilogo(
            o.testo("chiave"), o.testo("nome"), o.intero("fatture"), o.numero("compenso"), o.numero("contributo"), o.numero("iva"),
            o.numero("anticipazioni"), o.numero("totale"), o.numero("ritenute"), o.numero("incassato"),
        )
    }
}

data class RiepilogoFatturato(val anno: Int, val per: String, val righe: List<RigaRiepilogo>, val totali: RigaRiepilogo?, val fatturato: Double?, val incassato: Double?) {
    companion object {
        fun daJson(o: JSONObject) = RiepilogoFatturato(
            o.intero("anno"), o.testo("per"), o.optJSONArray("righe").oggetti().map(RigaRiepilogo::daJson),
            o.optJSONObject("totali")?.let(RigaRiepilogo::daJson), o.numero("fatturato"), o.numero("incassato"),
        )
    }
}

// ---------------------------------------------------------------------------------- banche e scadenze

data class ContoBanca(
    val id: String, val nome: String, val banca: String = "", val ultimeCifre: String = "", val iban: String = "", val predefinito: Boolean = false,
    val soglia: Double? = null, val attivo: Boolean = true, val note: String = "", val saldo: Double? = null, val saldoAl: String = "",
    val saldoScritto: Double? = null, val movimentiDopo: Int = 0, val verificatiDopo: Int = 0,
) {
    /** "Conto studio …3456": l'IBAN intero non si mostra negli elenchi. */
    val nomeCorto: String get() = nome + if (ultimeCifre.isNotBlank()) " …$ultimeCifre" else ""

    companion object {
        fun daJson(o: JSONObject) = ContoBanca(
            o.testo("id"), o.testo("nome"), o.testo("banca"), o.testo("ultimeCifre"), o.testo("iban"), o.vero("predefinito"),
            o.numero("soglia"), if (o.has("attivo")) o.vero("attivo") else true, o.testo("note"), o.numero("saldo"), o.testo("saldoAl"),
            o.numero("saldoScritto"), o.intero("movimentiDopo"), o.intero("verificatiDopo"),
        )

        /** Il controllo dell'IBAN (modulo 97), come ibanValido del server: solo per l'avviso prima di mandare. */
        fun ibanValido(iban: String): Boolean {
            val t = iban.replace(" ", "").uppercase()
            if (t.length < 15 || t.length > 34 || !t.all { it.isLetterOrDigit() }) return false
            if (t.startsWith("IT") && t.length != 27) return false
            val girato = t.drop(4) + t.take(4)
            var resto = 0
            for (ch in girato) {
                val v = if (ch.isDigit()) ch.toString() else (ch - 'A' + 10).toString()
                for (d in v) resto = (resto * 10 + (d - '0')) % 97
            }
            return resto == 1
        }
    }
}

data class Abbinamento(val tipo: String, val id: String, val etichetta: String, val importo: Double?)

data class Movimento(
    val id: String, val idConto: String, val conto: String, val data: String, val verso: String, val importo: Double?, val descrizione: String,
    val idSoggetto: String, val soggetto: String, val categoria: String, val verificato: Boolean, val abbinamenti: List<Abbinamento>,
    val annullato: Boolean, val motivo: String, val puoScrivere: Boolean,
) {
    val entrata: Boolean get() = verso == "entrata"

    companion object {
        val CATEGORIE = listOf("incasso" to "Incasso", "pagamento" to "Pagamento", "tributo" to "Tributo", "stipendio" to "Stipendio", "giroconto" to "Giroconto", "altro" to "Altro")

        fun daJson(o: JSONObject) = Movimento(
            o.testo("id"), o.testo("idConto"), o.testo("conto"), o.testo("data"), o.testo("verso"), o.numero("importo"), o.testo("descrizione"),
            o.testo("idSoggetto"), o.testo("soggetto"), o.testo("categoria"), o.vero("verificato"),
            o.optJSONArray("abbinamenti").oggetti().map { Abbinamento(it.testo("tipo"), it.testo("id"), it.testo("etichetta"), it.numero("importo")) },
            o.vero("annullato"), o.testo("motivo"), o.vero("puoScrivere"),
        )
    }
}

data class ElencoMovimenti(val pagina: Int, val pagine: Int, val quante: Int, val entrate: Double?, val uscite: Double?, val daVerificare: Int, val movimenti: List<Movimento>) {
    companion object {
        fun daJson(o: JSONObject) = ElencoMovimenti(
            o.intero("pagina"), o.intero("pagine"), o.intero("quante"), o.numero("entrate"), o.numero("uscite"), o.intero("daVerificare"),
            o.optJSONArray("movimenti").oggetti().map(Movimento::daJson),
        )
    }
}

data class RigaScadenziario(
    val tipo: String, val id: String, val data: String, val verso: String, val titolo: String, val dettaglio: String, val importo: Double?,
    val stato: String, val proposta: Boolean, val contaNelSaldo: Boolean, val importoDaScrivere: Boolean,
) {
    val entrata: Boolean get() = verso == "entrata"

    /** La pillola: Previsto · In parte · Scaduto · Da emettere · Proposta. */
    val parola: String
        get() = when (stato) {
            "in_parte" -> "In parte"
            "scaduto" -> "Scaduto"
            "da_emettere" -> "Da emettere"
            "proposto" -> "Proposta"
            else -> "Previsto"
        }

    companion object {
        fun daJson(o: JSONObject) = RigaScadenziario(
            o.testo("tipo"), o.testo("id"), o.testo("data"), o.testo("verso"), o.testo("titolo"), o.testo("dettaglio"), o.numero("importo"),
            o.testo("stato"), o.vero("proposta"), o.vero("contaNelSaldo"), o.vero("importoDaScrivere"),
        )
    }
}

data class GiornoScadenziario(val data: String, val titolo: String, val saldo: Double?, val sottoSoglia: Boolean, val righe: List<RigaScadenziario>)

data class Scadenziario(
    val oggi: String = "", val da: String = "", val a: String = "", val saldoOggi: Double? = null, val soglia: Double? = null, val saldoPartenza: Double? = null,
    val scaduti: List<RigaScadenziario> = emptyList(), val giorni: List<GiornoScadenziario> = emptyList(),
    val senzaDataEntrate: Double? = null, val senzaDataVoci: Int = 0, val primoSottoSoglia: String = "", val nota: String = "",
) {
    /**
     * Il saldo previsto rifatto sul telefono dalle righe (fase4.md §10.3): si parte dal
     * saldo di oggi meno le uscite scadute (le entrate scadute non contano), poi giorno
     * per giorno entrate meno uscite delle righe che contano. Serve a controllare che
     * quello che si vede torni con il server, e a dire quali giorni sono sotto soglia.
     */
    fun ricalcola(): List<Pair<Double, Boolean>> {
        val soglia = soglia ?: 0.0
        var saldo = partenzaRicalcolata()
        return giorni.map { g ->
            g.righe.filter { it.contaNelSaldo && !it.importoDaScrivere }.forEach { r ->
                saldo = RegoleFattura.centesimi(saldo + (if (r.entrata) 1 else -1) * (r.importo ?: 0.0))
            }
            saldo to (saldo < soglia)
        }
    }

    fun partenzaRicalcolata(): Double =
        RegoleFattura.centesimi((saldoOggi ?: 0.0) - scaduti.filter { !it.entrata && it.contaNelSaldo && !it.importoDaScrivere }.sumOf { it.importo ?: 0.0 })

    companion object {
        fun daJson(o: JSONObject): Scadenziario {
            val sd = o.optJSONObject("senzaData")
            return Scadenziario(
                o.testo("oggi"), o.testo("da"), o.testo("a"), o.numero("saldoOggi"), o.numero("soglia"), o.numero("saldoPartenza"),
                o.optJSONArray("scaduti").oggetti().map(RigaScadenziario::daJson),
                o.optJSONArray("giorni").oggetti().map { g ->
                    GiornoScadenziario(g.testo("data"), g.testo("titolo"), g.numero("saldo"), g.vero("sottoSoglia"), g.optJSONArray("righe").oggetti().map(RigaScadenziario::daJson))
                },
                sd?.numero("entrate"), sd?.intero("voci") ?: 0, o.testo("primoSottoSoglia"), o.testo("nota"),
            )
        }
    }
}

data class RicorrenzaImpegno(val regola: String, val ogni: Int, val fine: String)

data class Impegno(
    val id: String, val tipo: String = "f24", val verso: String = "uscita", val descrizione: String = "", val codice: String = "", val scadenza: String = "",
    val importo: Double? = null, val importoDaScrivere: Boolean = false, val idConto: String = "", val conto: String = "", val soggetto: String = "",
    val idRicorrenza: String = "", val ricorrenza: RicorrenzaImpegno? = null, val ripete: String = "", val origine: String = "mano", val periodo: String = "",
    val confermato: Boolean = true, val proposta: Boolean = false, val pagato: Double? = null, val daPagare: Double? = null, val stato: String = "aperto",
    val statoVisto: String = "", val scaduto: Boolean = false, val giorniScaduto: Int = 0, val annullato: Boolean = false, val note: String = "", val puoScrivere: Boolean = false,
) {
    companion object {
        val TIPI = listOf("f24" to "F24", "tributo" to "Tributo", "rata" to "Rata", "altro" to "Altro")

        fun daJson(o: JSONObject): Impegno {
            val r = o.optJSONObject("ricorrenza")
            return Impegno(
                o.testo("id"), o.testo("tipo"), o.testo("verso").ifBlank { "uscita" }, o.testo("descrizione"), o.testo("codice"), o.testo("scadenza"),
                o.numero("importo"), o.vero("importoDaScrivere"), o.testo("idConto"), o.testo("conto"), o.testo("soggetto"),
                o.testo("idRicorrenza"), r?.let { RicorrenzaImpegno(it.testo("regola"), it.intero("ogni").coerceAtLeast(1), it.testo("fine")) },
                o.testo("ripete"), o.testo("origine"), o.testo("periodo"), if (o.has("confermato")) o.vero("confermato") else true, o.vero("proposta"),
                o.numero("pagato"), o.numero("daPagare"), o.testo("stato"), o.testo("statoVisto"), o.vero("scaduto"), o.intero("giorniScaduto"),
                o.vero("annullato"), o.testo("note"), o.vero("puoScrivere"),
            )
        }
    }
}

data class SettimanaSituazione(val da: String, val a: String, val entrate: Double?, val uscite: Double?, val saldo: Double?, val sottoSoglia: Boolean)

data class Situazione(
    val saldi: List<Triple<String, String, Double?>> = emptyList(), val saldoOggi: Double? = null, val soglia: Double? = null,
    val daIncassare: Double? = null, val scadutoDaIncassare: Double? = null, val daPagare30: Double? = null, val scadutoDaPagare: Double? = null,
    val previsto30: Double? = null, val previsto60: Double? = null, val previsto90: Double? = null, val primoSottoSoglia: String = "",
    val settimane: List<SettimanaSituazione> = emptyList(), val fatturatoAnno: Double? = null, val incassatoAnno: Double? = null,
) {
    companion object {
        fun daJson(o: JSONObject): Situazione {
            val p = o.optJSONObject("previsto")
            return Situazione(
                o.optJSONArray("saldi").oggetti().map { Triple(it.testo("idConto"), it.testo("nome"), it.numero("saldo")) },
                o.numero("saldoOggi"), o.numero("soglia"), o.numero("daIncassare"), o.numero("scadutoDaIncassare"), o.numero("daPagare30"),
                o.numero("scadutoDaPagare"), p?.numero("30"), p?.numero("60"), p?.numero("90"), o.testo("primoSottoSoglia"),
                o.optJSONArray("settimane").oggetti().map { SettimanaSituazione(it.testo("da"), it.testo("a"), it.numero("entrate"), it.numero("uscite"), it.numero("saldo"), it.vero("sottoSoglia")) },
                o.numero("fatturatoAnno"), o.numero("incassatoAnno"),
            )
        }
    }
}

/** I numeri dei soldi della Dashboard della fase 4 (§15.16). Null = chi è entrato non vede fatture e banche. */
data class NumeriFase4(
    val daFatturare: Double? = null, val clientiDaFatturare: Int = 0, val fattureInBozza: Double? = null, val daIncassare: Double? = null,
    val scaduto: Double? = null, val saldoConti: Double? = null, val incassiSettimana: Double? = null, val pagamentiSettimana: Double? = null,
    val saldoPrevisto30: Double? = null, val primoSottoSoglia: String = "",
) {
    companion object {
        fun daJson(soldi: JSONObject?): NumeriFase4? {
            if (soldi == null || !(soldi.has("daIncassare") || soldi.has("fattureInBozza") || soldi.has("saldoConti"))) return null
            return NumeriFase4(
                soldi.numero("daFatturare"), soldi.intero("clientiDaFatturare"), soldi.numero("fattureInBozza"), soldi.numero("daIncassare"),
                soldi.numero("scaduto"), soldi.numero("saldoConti"), soldi.numero("incassiSettimana"), soldi.numero("pagamentiSettimana"),
                soldi.numero("saldoPrevisto30"), soldi.testo("primoSottoSoglia"),
            )
        }
    }
}

/** Le impostazioni fiscali (§15.2) e la conferma del commercialista. */
data class RegoleFiscali(val confermateIl: String = "", val commercialista: String = "") {
    val confermate: Boolean get() = confermateIl.isNotBlank()

    companion object {
        /** REGOLE_FISCALI_CONFERMATE delle impostazioni: un JSON {data, commercialista, da}, o vuoto. */
        fun da(impostazioni: Map<String, String>): RegoleFiscali {
            val t = impostazioni["REGOLE_FISCALI_CONFERMATE"].orEmpty().trim()
            if (t.isBlank() || t == "null") return RegoleFiscali()
            return runCatching { JSONObject(t) }.getOrNull()?.let { RegoleFiscali(it.testo("data"), it.testo("commercialista")) } ?: RegoleFiscali()
        }
    }
}

/** Le parole e i colori di stato: le prende la UI, qui solo il tipo di colore. */
object ColoreStato {
    const val GRIGIO = "grigio"
    const val BLU = "blu"
    const val VERDE = "verde"
    const val AMBRA = "ambra"
    const val ROSSO = "rosso"

    /** fase4.md §13: Bozza e Scartata grigie, Pronta ed Emessa blu, Pagata verde, Pagata in parte ambra, Scaduta rosso tenue. */
    fun di(statoVisto: String): String = when {
        statoVisto.startsWith("Scadut") -> ROSSO
        statoVisto == "Pagata in parte" || statoVisto == "Pagato in parte" || statoVisto == "In parte" -> AMBRA
        statoVisto.startsWith("Pagat") -> VERDE
        statoVisto.startsWith("Pronta") || statoVisto == "Emessa" || statoVisto == "Da pagare" -> BLU
        statoVisto == "Proposta" -> AMBRA
        else -> GRIGIO
    }
}
