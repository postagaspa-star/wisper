package eu.stgm.wisper.rapportino

import org.json.JSONArray
import org.json.JSONObject
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.temporal.ChronoUnit

/*
 * Fase 6, persone e risorse umane (docs/gestionale/fase6.md §3-§6, architettura.md §17.3-§17.9).
 *
 * PRIVACY. Il server decide chi vede cosa e TOGLIE i campi che uno non vede (chiavi
 * comprese). Qui i campi personali e riservati sono nullable: null = il server non
 * l'ha mandato, e la schermata non mostra né il valore né la riga. Mai un campo
 * vuoto al posto di uno che non si vede.
 */

/** Un testo che può non esserci: null se il server non ha mandato la chiave. */
internal fun JSONObject.testoSe(campo: String): String? = if (!has(campo)) null else testo(campo)

/** Un numero che può non esserci (o essere null). */
internal fun JSONObject.numeroSe(campo: String): Double? = if (!has(campo)) null else numero(campo)

/** Le parole fisse di fase6.md §12 per le persone. */
object ParolePersone {
    val RAPPORTI = linkedMapOf(
        "titolare" to "Titolare", "socio" to "Socio", "dipendente" to "Dipendente", "apprendista" to "Apprendista",
        "tirocinante" to "Tirocinante", "autonomo" to "A partita IVA nello studio", "altro" to "Altro",
    )

    fun rapporto(chiave: String): String = RAPPORTI[chiave] ?: "Da completare"

    /** I tipi di assenza con la loro parola. */
    val TIPI = linkedMapOf(
        "ferie" to "Ferie", "permesso" to "Permesso", "malattia" to "Malattia", "infortunio" to "Infortunio",
        "congedo" to "Congedo", "legge104" to "Legge 104", "altro" to "Altro",
    )

    /** Le assenze che si segnalano (nascono approvate) e il cui tipo è riservato. */
    val SANITARIE = setOf("malattia", "infortunio", "congedo", "legge104")

    /** Le parole delle sanitarie: sul disco e negli avvisi diventano "Assente". */
    val PAROLE_SANITARIE = setOf("Malattia", "Infortunio", "Congedo", "Legge 104")

    val STATI = linkedMapOf("bozza" to "Bozza", "da_approvare" to "Da approvare", "approvata" to "Approvata", "respinta" to "Respinta", "annullata" to "Annullata")

    val GIUDIZI = linkedMapOf(
        "idoneo" to "Idoneo", "idoneo_prescrizioni" to "Idoneo con prescrizioni",
        "non_idoneo_temporaneo" to "Non idoneo per ora", "non_idoneo" to "Non idoneo",
    )

    val PROPOSTE_DPI = listOf("Guanti isolanti", "Elmetto con visiera", "Calzature di sicurezza", "Occhiali", "Imbracatura anticaduta", "Tuta", "Otoprotettori", "Altro")
}

// ---------------------------------------------------------------------------------- i conti condivisi (§6.3)

/**
 * I conti delle assenze portati da server/src/conti.js, coi casi di
 * server/prove/casi-persone.json (PersoneTest li rifà tutti): festivi, giorni
 * lavorativi, ore di un'assenza, saldo di ferie e permessi, costo orario dal costo
 * dell'anno. Servono all'anteprima di "Chiedi ferie o permesso" (anche senza rete)
 * e alla settimana del telefono; il numero vero lo dice il server.
 */
object ContiPersone {
    fun centesimi(n: Double): Double = Math.floor(n * 100 + 0.5) / 100.0

    /** La Pasqua (Meeus), come pasqua() del server. */
    fun pasqua(anno: Int): LocalDate {
        val a = anno % 19
        val b = anno / 100
        val c = anno % 100
        val d = b / 4
        val e = b % 4
        val f = (b + 8) / 25
        val g = (b - f + 1) / 3
        val h = (19 * a + b - d - g + 15) % 30
        val i = c / 4
        val k = c % 4
        val l = (32 + 2 * e + 2 * i - h - k) % 7
        val m = (a + 11 * h + 22 * l) / 451
        val mese = (h + l - 7 * m + 114) / 31
        val giorno = ((h + l - 7 * m + 114) % 31) + 1
        return LocalDate.of(anno, mese, giorno)
    }

    /** I festivi di un anno: fissi, Pasquetta, il 4 ottobre dal 2026, il santo patrono ("mm-gg"). */
    fun festivi(anno: Int, patrono: String = ""): List<LocalDate> {
        val fissi = mutableListOf("01-01", "01-06", "04-25", "05-01", "06-02", "08-15", "11-01", "12-08", "12-25", "12-26")
        if (anno >= 2026) fissi.add("10-04")
        val p = patrono.trim()
        if (Regex("""^\d{2}-\d{2}$""").matches(p)) fissi.add(p)
        val out = fissi.mapNotNull { runCatching { LocalDate.parse("$anno-$it") }.getOrNull() }.toMutableSet()
        out.add(pasqua(anno).plusDays(1))
        return out.sorted()
    }

    /** I festivi di tutti gli anni fra due date. */
    fun festiviTra(dal: LocalDate, al: LocalDate, patrono: String = ""): Set<LocalDate> =
        (dal.year..al.year).flatMap { festivi(it, patrono) }.toSet()

    /** I giorni lavorativi della persona fra due date comprese: nei suoi giorni (1 = lunedì), non festivi. */
    fun giorniLavorativiElenco(dal: LocalDate, al: LocalDate, giorniSettimana: List<Int>, festivi: Set<LocalDate>): List<LocalDate> {
        val giorni = giorniSettimana.ifEmpty { listOf(1, 2, 3, 4, 5) }
        val out = mutableListOf<LocalDate>()
        var g = dal
        while (!g.isAfter(al) && out.size < 1000) {
            if (g.dayOfWeek.value in giorni && g !in festivi) out.add(g)
            g = g.plusDays(1)
        }
        return out
    }

    fun giorniLavorativi(dal: LocalDate, al: LocalDate, giorniSettimana: List<Int>, festivi: Set<LocalDate>): Int =
        giorniLavorativiElenco(dal, al, giorniSettimana, festivi).size

    /** Le ore del giorno: ore alla settimana / giorni lavorativi (di base [oreGiornaliere] × 5 su 5). */
    fun oreGiorno(oreSettimana: Double?, giorniSettimana: List<Int>, oreGiornaliere: Double = 8.0): Double {
        val giorni = giorniSettimana.size.takeIf { it > 0 } ?: 5
        val settimana = oreSettimana ?: (oreGiornaliere.takeIf { it > 0 } ?: 8.0) * giorni
        return Math.round(settimana / giorni * 100) / 100.0
    }

    /** I dati di un'assenza che servono ai conti. */
    data class DatiAssenza(
        val tipo: String,
        val dal: LocalDate,
        val al: LocalDate? = null,
        val mezza: String = "",
        val dalle: String = "",
        val alle: String = "",
        val ore: Double? = null,
    )

    /** Il permesso, e "altro" o Legge 104 quando hanno dalle-alle o le ore scritte. */
    fun aOre(a: DatiAssenza): Boolean = when (a.tipo) {
        "permesso" -> true
        "altro", "legge104" -> a.dalle.isNotBlank() || a.alle.isNotBlank() || (a.ore ?: 0.0) > 0
        else -> false
    }

    private fun minuti(t: String): Int? {
        val m = Regex("""^(\d{1,2}):(\d{2})$""").find(t.trim()) ?: return null
        val h = m.groupValues[1].toInt()
        val mm = m.groupValues[2].toInt()
        if (h > 24 || mm > 59) return null
        return h * 60 + mm
    }

    /** Giorni e ore di un'assenza (§6.2), come oreAssenza() del server. */
    fun oreAssenza(a: DatiAssenza, oreSettimana: Double?, giorniSettimana: List<Int>, festivi: Set<LocalDate>, oreGiornaliere: Double = 8.0): Pair<Double, Double> {
        val al = a.al ?: a.dal
        val og = oreGiorno(oreSettimana, giorniSettimana, oreGiornaliere)
        val lavorativi = giorniLavorativi(a.dal, al, giorniSettimana, festivi)
        if (aOre(a)) {
            val ore = if (a.dalle.isNotBlank() && a.alle.isNotBlank()) {
                val m1 = minuti(a.dalle)
                val m2 = minuti(a.alle)
                if (m1 == null || m2 == null || m2 <= m1) 0.0 else Math.round((m2 - m1) / 60.0 * 100) / 100.0
            } else Math.round((a.ore ?: 0.0) * 100) / 100.0
            return 0.0 to (if (lavorativi > 0) ore else 0.0)
        }
        if (a.tipo in ParolePersone.SANITARIE) {
            val calendario = if (!al.isBefore(a.dal)) ChronoUnit.DAYS.between(a.dal, al).toDouble() + 1 else 0.0
            return calendario to Math.round(lavorativi * og * 100) / 100.0
        }
        val giorni = if (a.mezza.isNotBlank() && a.dal == al) (if (lavorativi > 0) 0.5 else 0.0) else lavorativi.toDouble()
        return giorni to Math.round(giorni * og * 100) / 100.0
    }

    /** Un saldo scritto dal cedolino. */
    data class SaldoScritto(val data: LocalDate, val ore: Double)

    /** Un'assenza per il saldo: già in ore (il server le passa giorno per giorno quando sono a cavallo). */
    data class AssenzaSaldo(val dal: LocalDate, val ore: Double, val stato: String)

    /**
     * Il saldo (§3.4, §6.3), come saldoAssenze() del server: parte dall'ultimo saldo
     * scritto, aggiunge i mesi maturati (rateo pieno del mese di entrata e di uscita),
     * toglie le godute; restano = oggi − prenotate. Null = "Saldo non tenuto".
     */
    fun saldo(annue: Double?, saldi: List<SaldoScritto>, assenze: List<AssenzaSaldo>, oggi: LocalDate, entrata: LocalDate? = null, uscita: LocalDate? = null): Saldo? {
        if (annue == null && saldi.isEmpty()) return null
        val ultimo = saldi.filter { !it.data.isAfter(oggi) }.maxByOrNull { it.data }
        val scritto = ultimo?.let { Math.round(it.ore * 100) / 100.0 } ?: 0.0
        val partenza = ultimo?.data ?: run {
            val gennaio = LocalDate.of(oggi.year, 1, 1)
            val meseEntrata = entrata?.withDayOfMonth(1)
            (if (meseEntrata != null && meseEntrata.isAfter(gennaio)) meseEntrata else gennaio).minusDays(1)
        }
        var mesi = 0
        if (annue != null) {
            var m = partenza.withDayOfMonth(1)
            for (i in 0 until 600) {
                val fine = m.withDayOfMonth(m.lengthOfMonth())
                if (fine.isAfter(oggi)) break
                val dentroEntrata = entrata == null || !fine.isBefore(entrata)
                val dentroUscita = uscita == null || !m.isAfter(uscita)
                if (fine.isAfter(partenza) && dentroEntrata && dentroUscita) mesi++
                m = fine.plusDays(1)
            }
        }
        val maturate = if (annue != null) centesimi(annue * mesi / 12) else 0.0
        var godute = 0.0
        var prenotate = 0.0
        for (a in assenze) {
            if (ultimo != null && !a.dal.isAfter(ultimo.data)) continue
            when (a.stato) {
                "approvata" -> if (!a.dal.isAfter(oggi)) godute += a.ore else prenotate += a.ore
                "da_approvare" -> prenotate += a.ore
            }
        }
        godute = Math.round(godute * 100) / 100.0
        prenotate = Math.round(prenotate * 100) / 100.0
        val oggiSaldo = centesimi(scritto + maturate - godute)
        return Saldo(tenuto = true, scritto = scritto, scrittoIl = ultimo?.data?.toString().orEmpty(), maturate = maturate, godute = godute, oggi = oggiSaldo, prenotate = prenotate, restano = centesimi(oggiSaldo - prenotate))
    }

    /** Il costo orario proposto dal costo dell'anno: costo / ore, al centesimo (null senza ore). */
    fun costoOrarioDaAnno(costoAnno: Double, oreAnno: Double): Double? = if (oreAnno > 0) centesimi(costoAnno / oreAnno) else null

    /** Le ore diventano giorni con le ore del giorno della persona, a un decimale come il server: 104 ore a 8 = 13. */
    fun giorniDaOre(ore: Double, oreGiorno: Double): Double {
        if (oreGiorno <= 0) return 0.0
        return Math.floor(ore / oreGiorno * 10 + 0.5) / 10
    }
}

// ---------------------------------------------------------------------------------- saldo, assenze

/** Il saldo di ferie o di permessi come lo dà il server (o lo rifà il telefono). */
data class Saldo(
    val tenuto: Boolean = false,
    val scritto: Double = 0.0,
    val scrittoIl: String = "",
    val maturate: Double = 0.0,
    val godute: Double = 0.0,
    val oggi: Double = 0.0,
    val prenotate: Double = 0.0,
    val restano: Double = 0.0,
    val oreGiorno: Double? = null,
    val giorniOggi: Double? = null,
    val giorniRestano: Double? = null,
) {
    companion object {
        fun daJson(o: JSONObject?): Saldo? = o?.let {
            Saldo(
                tenuto = it.vero("tenuto"), scritto = it.numero("scritto") ?: 0.0, scrittoIl = it.testo("scrittoIl"),
                maturate = it.numero("maturate") ?: 0.0, godute = it.numero("godute") ?: 0.0, oggi = it.numero("oggi") ?: 0.0,
                prenotate = it.numero("prenotate") ?: 0.0, restano = it.numero("restano") ?: 0.0, oreGiorno = it.numero("oreGiorno"),
                giorniOggi = it.numero("giorniOggi"), giorniRestano = it.numero("giorniRestano"),
            )
        }
    }
}

data class Saldi(val ferie: Saldo?, val permessi: Saldo?) {
    companion object {
        fun daJson(o: JSONObject?): Saldi? = o?.let { Saldi(Saldo.daJson(it.optJSONObject("ferie")), Saldo.daJson(it.optJSONObject("permessi"))) }
    }
}

/** "Assente oggi": dal, al e la parola che si può vedere ("Ferie", o "Assente"). */
data class AssenteOggi(val dal: String, val al: String, val tipoVisto: String) {
    companion object {
        fun daJson(o: JSONObject?): AssenteOggi? = o?.let { AssenteOggi(it.testo("dal"), it.testo("al"), it.testo("tipoVisto").ifBlank { "Assente" }) }
    }
}

/**
 * Un'assenza (§17.8). [tipo] è null quando il server non lo manda (il collega che
 * vede "Assente"); [nota], [causale] e [protocollo] null quando non si vedono.
 */
data class Assenza(
    val id: String,
    val idLocale: String = "",
    val idPersona: String = "",
    val persona: String = "",
    val tipo: String? = null,
    val tipoVisto: String = "Assente",
    val causale: String? = null,
    val dal: String,
    val al: String = dal,
    val mezza: String = "",
    val dalle: String = "",
    val alle: String = "",
    val giorni: Double = 0.0,
    val ore: Double = 0.0,
    val stato: String = "da_approvare",
    val statoVisto: String = "Da approvare",
    val nota: String? = null,
    val protocollo: String? = null,
    val approvataDaNome: String = "",
    val motivoRifiuto: String = "",
    val motivoAnnullo: String = "",
    val chiusura: String = "",
    val daApprovare: Boolean = false,
    val puoScrivere: Boolean = false,
    val puoAnnullare: Boolean = false,
    /** Scritta sul telefono e non ancora arrivata. */
    val inCoda: Boolean = false,
) {
    val dataDal: LocalDate? get() = dataDi(dal)
    val dataAl: LocalDate? get() = dataDi(al) ?: dataDal
    val viva: Boolean get() = stato == "approvata" || stato == "da_approvare"

    /** C'è nel giorno [g] (approvata o da approvare). */
    fun copre(g: LocalDate): Boolean {
        val d = dataDal ?: return false
        val a = dataAl ?: d
        return viva && !g.isBefore(d) && !g.isAfter(a)
    }

    /** A ore (un permesso dalle-alle): non è un giorno intero di assenza. */
    val aOre: Boolean get() = dalle.isNotBlank() || (giorni == 0.0 && ore > 0)

    companion object {
        fun daJson(o: JSONObject) = Assenza(
            id = o.testo("id"), idLocale = o.testo("idLocale"), idPersona = o.testo("idPersona"), persona = o.testo("persona"),
            tipo = o.testoSe("tipo")?.ifBlank { null }, tipoVisto = o.testo("tipoVisto").ifBlank { "Assente" },
            causale = o.testoSe("causale"), dal = o.testo("dal"), al = o.testo("al").ifBlank { o.testo("dal") },
            mezza = o.testo("mezza"), dalle = o.testo("dalle"), alle = o.testo("alle"),
            giorni = o.numero("giorni") ?: 0.0, ore = o.numero("ore") ?: 0.0,
            stato = o.testo("stato").ifBlank { "da_approvare" }, statoVisto = o.testo("statoVisto").ifBlank { ParolePersone.STATI[o.testo("stato")] ?: "" },
            nota = o.testoSe("nota"), protocollo = o.testoSe("protocollo"), approvataDaNome = o.testo("approvataDaNome"),
            motivoRifiuto = o.testo("motivoRifiuto"), motivoAnnullo = o.testo("motivoAnnullo"), chiusura = o.testo("chiusura"),
            daApprovare = o.vero("daApprovare"), puoScrivere = o.vero("puoScrivere"), puoAnnullare = o.vero("puoAnnullare"),
        )
    }
}

/** Una chiusura dello studio ("Studio chiuso: Natale"). */
data class Chiusura(val id: String, val nome: String, val dal: String, val al: String, val ferie: Boolean = false, val frase: String = "") {
    fun copre(g: LocalDate): Boolean {
        val d = dataDi(dal) ?: return false
        val a = dataDi(al) ?: d
        return !g.isBefore(d) && !g.isAfter(a)
    }

    companion object {
        fun daJson(o: JSONObject) = Chiusura(o.testo("id"), o.testo("nome"), o.testo("dal"), o.testo("al").ifBlank { o.testo("dal") }, o.vero("ferie"), o.testo("frase").ifBlank { "Studio chiuso: " + o.testo("nome") })
    }
}

/** Le assenze lette (`assenze {}`): le assenze, le chiusure e i festivi del periodo, il saldo se il filtro è una persona. */
data class ElencoAssenze(
    val oggi: String = "",
    val assenze: List<Assenza> = emptyList(),
    val chiusure: List<Chiusura> = emptyList(),
    val festivi: List<String> = emptyList(),
    val saldi: Saldi? = null,
    val lettoAl: String = "",
) {
    companion object {
        fun daJson(o: JSONObject) = ElencoAssenze(
            oggi = o.testo("oggi"),
            assenze = o.optJSONArray("assenze").oggetti().map(Assenza::daJson),
            chiusure = o.optJSONArray("chiusure").oggetti().map(Chiusura::daJson),
            festivi = o.optJSONArray("festivi")?.let { a -> (0 until a.length()).map { a.optString(it) } }.orEmpty(),
            saldi = Saldi.daJson(o.optJSONObject("saldi")),
            lettoAl = o.testo("_lettoAl"),
        )
    }
}

// ---------------------------------------------------------------------------------- l'organico e la scheda

/** Una riga dell'organico (`persone`). [costoOrario] null se non si vede (o non c'è: [costoNoto]). */
data class RigaPersona(
    val id: String,
    val nome: String,
    val rapporto: String = "",
    val rapportoNome: String = "",
    val ruoloStudio: String = "",
    val telefonoLavoro: String = "",
    val emailLavoro: String = "",
    val idUtente: String = "",
    val ruoloWisper: String = "",
    val accessoAttivo: Boolean = false,
    val assenteOggi: AssenteOggi? = null,
    val daCompletare: Boolean = false,
    val scadenzeVicine: Int = 0,
    val scadute: Int = 0,
    val costoOrario: Double? = null,
    /** Il server ha mandato la chiave del costo (chi vede i soldi): null = "Usa il costo dello studio". */
    val costoVisto: Boolean = false,
    val costoDal: String = "",
    val uscitaIl: String = "",
) {
    val iniziali: String get() = Utente("", nome).iniziali
    val senzaAccesso: Boolean get() = idUtente.isBlank() || !accessoAttivo

    companion object {
        fun daJson(o: JSONObject) = RigaPersona(
            id = o.testo("id"), nome = o.testo("nome"), rapporto = o.testo("rapporto"),
            rapportoNome = o.testo("rapportoNome").ifBlank { ParolePersone.rapporto(o.testo("rapporto")) },
            ruoloStudio = o.testo("ruoloStudio"), telefonoLavoro = o.testo("telefonoLavoro"), emailLavoro = o.testo("emailLavoro"),
            idUtente = o.testo("idUtente"), ruoloWisper = o.testo("ruoloWisper"), accessoAttivo = o.vero("accessoAttivo"),
            assenteOggi = AssenteOggi.daJson(o.optJSONObject("assenteOggi")), daCompletare = o.vero("daCompletare"),
            scadenzeVicine = o.optInt("scadenzeVicine"), scadute = o.optInt("scadute"),
            costoOrario = o.numero("costoOrario"), costoVisto = o.has("costoOrario"), costoDal = o.testo("costoDal"), uscitaIl = o.testo("uscitaIl"),
        )
    }
}

data class Organico(val persone: List<RigaPersona> = emptyList(), val attive: Int = 0, val senzaAccesso: Int = 0, val assentiOggi: Int = 0, val daCompletare: Int = 0) {
    companion object {
        fun daJson(o: JSONObject): Organico {
            val c = o.optJSONObject("conteggi")
            val l = o.optJSONArray("persone").oggetti().map(RigaPersona::daJson)
            return Organico(l, c?.optInt("attive") ?: l.size, c?.optInt("senzaAccesso") ?: 0, c?.optInt("assentiOggi") ?: 0, c?.optInt("daCompletare") ?: 0)
        }
    }
}

/** Una competenza, abilitazione o formazione (§5.3). */
data class Qualifica(
    val id: String, val tipo: String, val nome: String, val titolo: String = "", val data: String = "", val scade: String = "",
    val ente: String = "", val statoVisto: String = "", val statoDettaglio: String = "", val idDocumento: String = "",
) {
    companion object {
        fun daJson(o: JSONObject) = Qualifica(
            o.testo("id"), o.testo("tipo"), o.testo("nome"), o.testo("titolo"), o.testo("data"), o.testo("scade"),
            o.testo("ente"), o.testo("statoVisto"), o.testo("statoDettaglio"), o.testo("idDocumento"),
        )
    }
}

/**
 * Una visita medica (§5.4): [giudizio], [giudizioVisto], [prescrizioni] e [validoFino]
 * null se non si vedono (senza `riservati`): allora si mostra solo [riga].
 */
data class Visita(
    val id: String, val data: String, val tipo: String = "", val prossima: String = "", val medico: String = "",
    val giudizio: String? = null, val giudizioVisto: String? = null, val prescrizioni: String? = null, val validoFino: String? = null,
    val riga: String = "",
) {
    val conGiudizio: Boolean get() = giudizioVisto != null || giudizio != null

    companion object {
        fun daJson(o: JSONObject) = Visita(
            o.testo("id"), o.testo("data"), o.testo("tipo"), o.testo("prossima"), o.testo("medico"),
            o.testoSe("giudizio"), o.testoSe("giudizioVisto"), o.testoSe("prescrizioni"), o.testoSe("validoFino"),
            o.testo("riga").ifBlank { "Visita del " + dataIt(o.testo("data")) + if (o.testo("prossima").isNotBlank()) " · prossima il " + dataIt(o.testo("prossima")) else "" },
        )
    }
}

/** Una consegna di DPI con la firma di chi riceve (§5.5). */
data class ConsegnaDpi(
    val id: String, val idLocale: String = "", val idPersona: String = "", val persona: String = "", val cosa: String, val taglia: String = "",
    val quantita: Int = 1, val data: String = "", val idAttrezzatura: String = "", val firmata: Boolean = false, val firmataIl: String = "",
    val restituitoIl: String = "", val daFirmare: Boolean = false, val inCoda: Boolean = false,
) {
    companion object {
        fun daJson(o: JSONObject) = ConsegnaDpi(
            o.testo("id"), o.testo("idLocale"), o.testo("idPersona"), o.testo("persona"), o.testo("cosa"), o.testo("taglia"),
            o.optInt("quantita", 1), o.testo("data"), o.testo("idAttrezzatura"), o.vero("firmata"), o.testo("firmataIl"),
            o.testo("restituitoIl"), o.vero("daFirmare"),
        )
    }
}

/** Un mezzo, uno strumento o un'attrezzatura che la persona ha in uso. */
data class InUso(val tipo: String, val id: String, val codice: String = "", val nome: String, val categoria: String = "", val come: String = "", val dal: String = "", val rientro: String = "", val taratura: String = "") {
    companion object {
        fun daJson(o: JSONObject, tipo: String) = InUso(
            o.testo("tipo").ifBlank { tipo }, o.testo("id"), o.testo("codice"), o.testo("nome"), o.testo("categoria"),
            o.testo("come"), o.testo("dal"), o.testo("rientro"), o.testo("taratura"),
        )
    }
}

/** Un costo orario della persona da una data (§3.3): [costoAnno], [oreAnno], [notaCosto] null se riservati. */
data class CostoPersona(val id: String, val dal: String, val costoOrario: Double?, val costoAnno: Double? = null, val oreAnno: Double? = null, val notaCosto: String? = null) {
    companion object {
        fun daJson(o: JSONObject) = CostoPersona(o.testo("id"), o.testo("dal"), o.numero("costoOrario"), o.numeroSe("costoAnno"), o.numeroSe("oreAnno"), o.testoSe("notaCosto"))
    }
}

/**
 * La scheda della persona coi tre livelli (§5.1, §17.3). Tutti i campi personali e
 * riservati sono null quando il server non li manda: la schermata li salta.
 */
data class Persona(
    val id: String,
    val nome: String,
    // ---- di lavoro
    val rapporto: String = "",
    val rapportoNome: String = "",
    val ruoloStudio: String = "",
    val mansione: String = "",
    val emailLavoro: String = "",
    val telefonoLavoro: String = "",
    val entrataIl: String = "",
    val uscitaIl: String = "",
    val oreSettimana: Double? = null,
    val giorniSettimana: List<Int> = listOf(1, 2, 3, 4, 5),
    val oreGiorno: Double = 8.0,
    val idUtente: String = "",
    val ruoloWisper: String = "",
    val accessoAttivo: Boolean = false,
    val ultimoAccesso: String = "",
    val assenteOggi: AssenteOggi? = null,
    val anonimizzata: Boolean = false,
    // ---- personali (null = non si vedono)
    val codiceFiscale: String? = null,
    val nascitaData: String? = null,
    val nascitaLuogo: String? = null,
    val indirizzo: String? = null,
    val cap: String? = null,
    val citta: String? = null,
    val provincia: String? = null,
    val telefonoPersonale: String? = null,
    val emailPersonale: String? = null,
    val iban: String? = null,
    val emergenzaNome: String? = null,
    val emergenzaTelefono: String? = null,
    val contrattoTipo: String? = null,
    val contrattoScade: String? = null,
    val motivoUscita: String? = null,
    val ferieAnnueOre: Double? = null,
    val permessiAnnuiOre: Double? = null,
    val prossimaVisita: String? = null,
    // ---- riservati (null = non si vedono)
    val ccnl: String? = null,
    val livello: String? = null,
    val noteRiservate: String? = null,
    // ---- costi (null = non si vedono: la persona non vede il suo)
    val costoOrario: Double? = null,
    val costoVisto: Boolean = false,
    val costoDal: String? = null,
    val costoAnno: Double? = null,
    val oreAnno: Double? = null,
    val notaCosto: String? = null,
    val costi: List<CostoPersona>? = null,
    // ---- elenchi
    val mezzi: List<InUso> = emptyList(),
    val attrezzature: List<InUso> = emptyList(),
    val qualifiche: List<Qualifica> = emptyList(),
    val visite: List<Visita>? = null,
    val dpi: List<ConsegnaDpi>? = null,
    val saldi: Saldi? = null,
    val assenze: List<Assenza>? = null,
    val scadenze: List<Scadenza>? = null,
    val documenti: List<DocArchivio> = emptyList(),
    // ---- cosa si può fare
    val puoScrivere: Boolean = false,
    val puoCambiareContatti: Boolean = false,
    val puoVedereRiservati: Boolean = false,
    val puoApprovare: Boolean = false,
    val daCompletare: List<String> = emptyList(),
    val programmaPaghe: String = "",
    val lettoAl: String = "",
) {
    val iniziali: String get() = Utente("", nome).iniziali

    /** Ha i dati personali (persone 2 o la persona stessa): la sezione "Dati personali" c'è. */
    val conPersonali: Boolean
        get() = listOf(codiceFiscale, telefonoPersonale, iban, emergenzaNome, indirizzo, emailPersonale, contrattoTipo).any { it != null }

    /** Ha i riservati (CCNL, livello, note): li vede chi ha `riservati` e la persona stessa. */
    val conRiservati: Boolean get() = ccnl != null || livello != null || noteRiservate != null

    val senzaAccesso: Boolean get() = idUtente.isBlank() || !accessoAttivo

    companion object {
        fun daJson(o: JSONObject): Persona {
            val g = o.optJSONArray("giorniSettimana")
            return Persona(
                id = o.testo("id"), nome = o.testo("nome"), rapporto = o.testo("rapporto"),
                rapportoNome = o.testo("rapportoNome").ifBlank { ParolePersone.rapporto(o.testo("rapporto")) },
                ruoloStudio = o.testo("ruoloStudio"), mansione = o.testo("mansione"), emailLavoro = o.testo("emailLavoro"),
                telefonoLavoro = o.testo("telefonoLavoro"), entrataIl = o.testo("entrataIl"), uscitaIl = o.testo("uscitaIl"),
                oreSettimana = o.numero("oreSettimana"),
                giorniSettimana = g?.let { a -> (0 until a.length()).map { a.optInt(it) }.filter { it in 1..7 } }?.ifEmpty { null } ?: listOf(1, 2, 3, 4, 5),
                oreGiorno = o.numero("oreGiorno") ?: 8.0, idUtente = o.testo("idUtente"), ruoloWisper = o.testo("ruoloWisper"),
                accessoAttivo = o.vero("accessoAttivo"), ultimoAccesso = o.testo("ultimoAccesso"),
                assenteOggi = AssenteOggi.daJson(o.optJSONObject("assenteOggi")), anonimizzata = o.vero("anonimizzata"),
                codiceFiscale = o.testoSe("codiceFiscale"), nascitaData = o.testoSe("nascitaData"), nascitaLuogo = o.testoSe("nascitaLuogo"),
                indirizzo = o.testoSe("indirizzo"), cap = o.testoSe("cap"), citta = o.testoSe("citta"), provincia = o.testoSe("provincia"),
                telefonoPersonale = o.testoSe("telefonoPersonale"), emailPersonale = o.testoSe("emailPersonale"), iban = o.testoSe("iban"),
                emergenzaNome = o.testoSe("emergenzaNome"), emergenzaTelefono = o.testoSe("emergenzaTelefono"),
                contrattoTipo = o.testoSe("contrattoTipo"), contrattoScade = o.testoSe("contrattoScade"), motivoUscita = o.testoSe("motivoUscita"),
                ferieAnnueOre = o.numeroSe("ferieAnnueOre"), permessiAnnuiOre = o.numeroSe("permessiAnnuiOre"), prossimaVisita = o.testoSe("prossimaVisita"),
                ccnl = o.testoSe("ccnl"), livello = o.testoSe("livello"), noteRiservate = o.testoSe("noteRiservate"),
                costoOrario = o.numero("costoOrario"), costoVisto = o.has("costoOrario"), costoDal = o.testoSe("costoDal"),
                costoAnno = o.numeroSe("costoAnno"), oreAnno = o.numeroSe("oreAnno"), notaCosto = o.testoSe("notaCosto"),
                costi = if (o.has("costi")) o.optJSONArray("costi").oggetti().map(CostoPersona::daJson) else null,
                mezzi = o.optJSONArray("mezzi").oggetti().map { InUso.daJson(it, "mezzo") },
                attrezzature = o.optJSONArray("attrezzature").oggetti().map { InUso.daJson(it, "attrezzatura") },
                qualifiche = o.optJSONArray("qualifiche").oggetti().map(Qualifica::daJson),
                visite = if (o.has("visite")) o.optJSONArray("visite").oggetti().map(Visita::daJson) else null,
                dpi = if (o.has("dpi")) o.optJSONArray("dpi").oggetti().map(ConsegnaDpi::daJson) else null,
                saldi = Saldi.daJson(o.optJSONObject("saldi")),
                assenze = if (o.has("assenze")) o.optJSONArray("assenze").oggetti().map(Assenza::daJson) else null,
                scadenze = if (o.has("scadenze")) o.optJSONArray("scadenze").oggetti().map(Scadenza::daJson) else null,
                documenti = o.optJSONArray("documenti").oggetti().map(DocArchivio::daJson),
                puoScrivere = o.vero("puoScrivere"), puoCambiareContatti = o.vero("puoCambiareContatti"),
                puoVedereRiservati = o.vero("puoVedereRiservati"), puoApprovare = o.vero("puoApprovare"),
                daCompletare = o.optJSONArray("daCompletare")?.let { a -> (0 until a.length()).map { a.optString(it) }.filter { it.isNotBlank() } }.orEmpty(),
                programmaPaghe = o.testo("programmaPaghe"), lettoAl = o.testo("_lettoAl"),
            )
        }
    }
}

// ---------------------------------------------------------------------------------- presenze, registro

data class GiornoPresenze(val data: String, val previste: Double, val lavorate: Double, val straordinarie: Double, val assenza: String, val oreAssenza: Double, val manca: Double, val giorno: String)

data class TotaliPresenze(val giorniLavorati: Int, val oreLavorate: Double, val straordinarie: Double, val ferie: Double, val permessi: Double, val malattiaGiorni: Double?, val altreAssenze: Double, val mancano: Double)

data class PresenzePersona(val idPersona: String, val nome: String, val oreGiorno: Double, val giorni: List<GiornoPresenze>, val totali: TotaliPresenze)

/** Le presenze del mese, ricavate dal lavoro registrato (§6.7): niente timbrature. */
data class Presenze(val mese: String, val persone: List<PresenzePersona>, val programmaPaghe: String) {
    companion object {
        fun daJson(o: JSONObject) = Presenze(
            mese = o.testo("mese"),
            persone = o.optJSONArray("persone").oggetti().map { p ->
                val t = p.optJSONObject("totali") ?: JSONObject()
                PresenzePersona(
                    p.testo("idPersona"), p.testo("nome"), p.numero("oreGiorno") ?: 8.0,
                    p.optJSONArray("giorni").oggetti().map { g ->
                        val a = g.optJSONObject("assenza")
                        GiornoPresenze(g.testo("data"), g.numero("previste") ?: 0.0, g.numero("lavorate") ?: 0.0, g.numero("straordinarie") ?: 0.0,
                            a?.testo("tipoVisto").orEmpty(), a?.numero("ore") ?: 0.0, g.numero("manca") ?: 0.0, g.testo("giorno"))
                    },
                    TotaliPresenze(t.optInt("giorniLavorati"), t.numero("oreLavorate") ?: 0.0, t.numero("straordinarie") ?: 0.0, t.numero("ferie") ?: 0.0,
                        t.numero("permessi") ?: 0.0, t.optJSONObject("malattia")?.numero("giorni"), t.numero("altreAssenze") ?: 0.0, t.numero("mancano") ?: 0.0),
                )
            },
            programmaPaghe = o.testo("programmaPaghe"),
        )
    }
}

/** Una riga del registro di chi ha aperto i dati riservati (§17.6). */
data class AccessoRiservato(val quando: String, val utente: String, val persona: String, val frase: String, val disp: String) {
    companion object {
        fun daJson(o: JSONObject) = AccessoRiservato(o.testo("quando"), o.testo("utente"), o.testo("persona"), o.testo("frase"), o.testo("disp"))
    }
}

/** Un tipo di competenza o formazione (§5.3). */
data class TipoQualifica(val chiave: String, val nome: String, val gruppo: String, val ogniMesi: Int?, val attivo: Boolean, val preavvisoGiorni: Int? = null) {
    companion object {
        fun daJson(o: JSONObject) = TipoQualifica(
            o.testo("chiave"), o.testo("nome"), o.testo("gruppo"), o.numero("ogniMesi")?.toInt(), !o.has("attivo") || o.vero("attivo"), o.numero("preavvisoGiorni")?.toInt(),
        )
    }
}

// ---------------------------------------------------------------------------------- privacy sul disco

/**
 * Cosa resta sul disco del telefono (§3.13 e regola dei riservati): solo quello che
 * il server ha mandato a chi è entrato, e dei COLLEGHI mai i dati personali o
 * riservati, nemmeno se chi è entrato li vede (il titolare): sul disco un'assenza di
 * un altro è "Assente" coi giorni, senza tipo, nota, causale né protocollo.
 */
object PrivacyDisco {
    private val CAMPI_ASSENZA_ALTRI = setOf("id", "idLocale", "idPersona", "persona", "dal", "al", "mezza", "dalle", "alle", "giorni", "ore", "stato", "statoVisto", "chiusura", "idChiusura")

    /** Un'assenza di un'altra persona come resta sul disco: "Assente" e i giorni. */
    fun assenzaDiAltri(o: JSONObject): JSONObject {
        val out = JSONObject()
        CAMPI_ASSENZA_ALTRI.forEach { k -> if (o.has(k)) out.put(k, o.get(k)) }
        return out.put("tipoVisto", "Assente")
    }

    /** L'elenco delle assenze per il disco: le mie intere, quelle degli altri come "Assente". */
    fun assenze(o: JSONObject, idPersonaMia: String): JSONObject {
        val out = JSONObject(o.toString())
        val l = o.optJSONArray("assenze") ?: return out
        out.put("assenze", JSONArray().apply {
            l.oggetti().forEach { a -> put(if (idPersonaMia.isNotBlank() && a.testo("idPersona") == idPersonaMia) a else assenzaDiAltri(a)) }
        })
        // I saldi sono della persona del filtro: se non è la mia non restano.
        if (out.has("saldi") && o.testo("idPersona").let { it.isNotBlank() && it != idPersonaMia }) out.remove("saldi")
        return out
    }

    /**
     * La Dashboard per il disco: le parole delle assenze sanitarie diventano "Assente"
     * e le voci del giudizio di idoneità (riservate) non restano.
     */
    fun dashboard(o: JSONObject): JSONObject {
        val out = JSONObject(o.toString())
        out.optJSONArray("assentiOggi")?.oggetti()?.forEach { a -> if (a.testo("tipoVisto") in ParolePersone.PAROLE_SANITARIE) a.put("tipoVisto", "Assente") }
        for (s in listOf("urgenti", "settimana", "pianificare")) {
            val l = out.optJSONArray(s) ?: continue
            val tenute = JSONArray()
            l.oggetti().forEach { v ->
                val tipo = v.testo("tipo")
                if (tipo == "visita" && (v.testo("titolo").contains("idone", ignoreCase = true))) return@forEach
                if (tipo == "assenza") {
                    v.put("titolo", senzaSanitarie(v.testo("titolo")))
                    v.put("dettaglio", senzaSanitarie(v.testo("dettaglio")))
                }
                tenute.put(v)
            }
            out.put(s, tenute)
        }
        return out
    }

    /** "Malattia fino a venerdì" -> "Assente fino a venerdì". */
    fun senzaSanitarie(t: String): String {
        var r = t
        ParolePersone.PAROLE_SANITARIE.forEach { p -> r = r.replace(p, "Assente") }
        return r
    }
}

/** Il lunedì della settimana di un giorno. */
internal fun lunediDi(g: LocalDate): LocalDate = g.with(DayOfWeek.MONDAY)
