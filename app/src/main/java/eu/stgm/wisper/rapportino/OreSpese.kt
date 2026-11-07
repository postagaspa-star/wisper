package eu.stgm.wisper.rapportino

import org.json.JSONArray
import org.json.JSONObject
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.util.Locale
import java.util.UUID

/*
 * La fase 3 del gestionale (docs/gestionale/fase3.md, architettura.md §14): ore
 * senza rapportino, timer, approvazioni, spese, trasferte, veicoli e rimborsi.
 * Qui i dati come li manda il server (coi nomi di §14, campo per campo), i conti
 * condivisi che il telefono rifà per l'anteprima (server/prove/casi-ore-spese.json)
 * e le regole per mettere le cose in fila. Niente Android: si prova tutto.
 */

private val IT = Locale.ITALY

/** Gli stati di ore, spese e trasferte (§14.1). */
object StatoVoce {
    const val BOZZA = "bozza"
    const val DA_APPROVARE = "da_approvare"
    const val APPROVATA = "approvata"
    const val RESPINTA = "respinta"

    /** La parola della pillola; "" per le approvate, che non hanno pillola. */
    fun parola(stato: String, motivo: String = ""): String = when (stato) {
        BOZZA -> "Bozza"
        DA_APPROVARE -> "Da approvare"
        RESPINTA -> if (motivo.isBlank()) "Respinta" else "Respinta: $motivo"
        else -> ""
    }

    /** Conta nei conti: mandata o approvata (non bozza, non respinta). */
    fun conta(stato: String): Boolean = stato == DA_APPROVARE || stato == APPROVATA
}

/** Le categorie delle spese (§14.8), nell'ordine delle pillole: le più frequenti prima. */
object CategoriaSpesa {
    val ELENCO = listOf("pedaggio", "parcheggio", "carburante", "vitto", "alloggio", "treno", "aereo", "taxi", "materiale", "altro")

    /** Fase 6 (§7.4): le categorie che chiedono "Per quale mezzo". */
    val CON_MEZZO = setOf("carburante", "pedaggio", "parcheggio")

    fun nome(c: String): String = when (c) {
        "carburante" -> "Carburante"
        "pedaggio" -> "Pedaggio"
        "parcheggio" -> "Parcheggio"
        "vitto" -> "Vitto"
        "alloggio" -> "Alloggio"
        "treno" -> "Treno"
        "aereo" -> "Aereo"
        "taxi" -> "Taxi"
        "materiale" -> "Materiale"
        else -> "Altro"
    }
}

/** A chi va una spesa (§14.8): una domanda chiara, non un gergo. */
object Destinazione {
    const val CLIENTE = "cliente"
    const val STUDIO = "studio"
    const val PERSONALE = "personale"

    val ELENCO = listOf(CLIENTE, STUDIO, PERSONALE)

    fun nome(d: String): String = when (d) {
        CLIENTE -> "Al cliente"
        PERSONALE -> "Mia"
        else -> "Allo studio"
    }

    /** Di base: al cliente se c'è una commessa (o un cliente), allo studio se no. */
    fun diBase(idCommessa: String, idCliente: String = ""): String = if (idCommessa.isNotBlank() || idCliente.isNotBlank()) CLIENTE else STUDIO
}

/** Un errore di inizio, fine o pausa: il messaggio è quello del server, parola per parola. */
class ErroreOre(messaggio: String) : IllegalArgumentException(messaggio)

/** Le ore da inizio, fine e pausa (oreDaOrari di server/src/conti.js). */
data class OreCalcolate(
    val inizio: String,
    val fine: String,
    val pausaMinuti: Int,
    val minuti: Int,
    val ore: Double,
    val giornoDopo: Boolean,
)

/** Il rimborso di una trasferta (rimborsoTrasferta di conti.js). */
data class RimborsoCalcolato(val kmTotali: Double, val rimborsoKm: Double, val indennita: Double, val totale: Double)

/**
 * I conti della fase 3 che il telefono rifà per l'anteprima, portati da
 * server/src/conti.js con gli stessi casi (server/prove/casi-ore-spese.json):
 * stessi numeri al centesimo, stesse frasi.
 */
object ContiOreSpese {

    /** Math.round(n * 100) / 100 di JavaScript (il mezzo va verso l'alto). */
    fun centesimi(n: Double): Double = Math.floor(n * 100 + 0.5) / 100.0

    /** "8:30", "08:30", "08.30" o "08:30:00" -> minuti dalla mezzanotte (510), oppure null. */
    fun minutiDa(ora: String?): Int? {
        val m = Regex("""^(\d{1,2})[:.](\d{2})(?::\d{2})?$""").matchEntire(ora?.trim().orEmpty()) ?: return null
        val h = m.groupValues[1].toInt()
        val mi = m.groupValues[2].toInt()
        return if (h > 23 || mi > 59) null else h * 60 + mi
    }

    /** 510 -> "08:30". */
    fun oraDaMinuti(minuti: Int): String = "%02d:%02d".format(minuti / 60, minuti % 60)

    /**
     * Le ore di una riga da inizio, fine e pausa. Una fine prima dell'inizio è del
     * giorno dopo (22:00-06:00 sono 8 ore); fine uguale all'inizio è un errore; la
     * pausa deve essere più corta del lavoro. [pausaMinuti]: null o "" = zero.
     */
    fun oreDaOrari(inizio: String?, fine: String?, pausaMinuti: Any? = 0): OreCalcolate {
        val a = minutiDa(inizio) ?: throw ErroreOre("Inizio: scrivi l'ora come 8:30")
        val b = minutiDa(fine) ?: throw ErroreOre("Fine: scrivi l'ora come 17:30")
        if (a == b) throw ErroreOre("Fine: deve essere diversa dall'inizio")
        val pausa = when (pausaMinuti) {
            null -> 0.0
            is Number -> pausaMinuti.toDouble()
            is String -> if (pausaMinuti.isBlank()) 0.0 else pausaMinuti.trim().replace(',', '.').toDoubleOrNull() ?: Double.NaN
            else -> Double.NaN
        }
        if (!(pausa >= 0) || Math.round(pausa).toDouble() != pausa) throw ErroreOre("Pausa: scrivi i minuti, da zero in su")
        val giornoDopo = b < a
        val durata = (if (giornoDopo) b + 1440 else b) - a
        if (pausa >= durata) throw ErroreOre("Pausa: è più lunga del lavoro")
        val minuti = durata - pausa.toInt()
        return OreCalcolate(oraDaMinuti(a), oraDaMinuti(b), pausa.toInt(), minuti, Math.floor(minuti / 60.0 * 100 + 0.5) / 100.0, giornoDopo)
    }

    /** km (x2 con andata e ritorno) x euro al km, al centesimo; più l'indennità. Ogni pezzo arrotondato prima di sommare. */
    fun rimborsoTrasferta(km: Double, andataRitorno: Boolean, euroKm: Double?, indennita: Double?): RimborsoCalcolato {
        val kmTotali = Math.floor(km * (if (andataRitorno) 2 else 1) * 100 + 0.5) / 100.0
        val rimborsoKm = centesimi(kmTotali * (euroKm ?: 0.0))
        val ind = centesimi(indennita ?: 0.0)
        return RimborsoCalcolato(kmTotali, rimborsoKm, ind, centesimi(rimborsoKm + ind))
    }

    fun rimborsoTrasferta(t: Trasferta): RimborsoCalcolato = rimborsoTrasferta(t.km, t.andataRitorno, t.euroKm, t.indennita)

    /**
     * I rimborsi dovuti a ogni persona: le spese che ha pagato lei, approvate, che
     * non sono "Mia", più le trasferte approvate, meno quelle già rimborsate.
     * inAttesa = le stesse cose ancora da approvare. In ordine di persona.
     */
    fun rimborsiDovuti(spese: List<Spesa>, trasferte: List<Trasferta>): List<RimborsoPersona> {
        val per = LinkedHashMap<String, RimborsoPersona>()
        fun di(id: String) = per.getOrPut(id) { RimborsoPersona(idUtente = id) }
        for (s in spese) {
            if (!s.pagataDaMe || s.destinazione == Destinazione.PERSONALE || s.rimborsataIl.isNotBlank() || s.tolta.isNotBlank() || s.idUtente.isBlank()) continue
            val p = di(s.idUtente)
            val euro = centesimi(s.importo)
            if (s.stato == StatoVoce.APPROVATA) {
                per[s.idUtente] = p.copy(
                    totale = centesimi(p.totale + euro), spese = p.spese + 1,
                    voci = p.voci + VoceRimborso("spesa", s.id, s.data, s.descrizione.ifBlank { CategoriaSpesa.nome(s.categoria) }, s.categoria, s.idCommessa, euro, null),
                )
            } else if (s.stato == StatoVoce.DA_APPROVARE) per[s.idUtente] = p.copy(inAttesa = centesimi(p.inAttesa + euro))
        }
        for (t in trasferte) {
            if (t.rimborsataIl.isNotBlank() || t.tolta.isNotBlank() || t.idUtente.isBlank()) continue
            val r = rimborsoTrasferta(t)
            if (!(r.totale > 0)) continue
            val p = di(t.idUtente)
            if (t.stato == StatoVoce.APPROVATA) {
                per[t.idUtente] = p.copy(
                    totale = centesimi(p.totale + r.totale), trasferte = p.trasferte + 1,
                    km = Math.floor((p.km + r.kmTotali) * 100 + 0.5) / 100.0,
                    voci = p.voci + VoceRimborso("trasferta", t.id, t.dal, t.destinazione, "", t.idCommessa, r.totale, r.kmTotali),
                )
            } else if (t.stato == StatoVoce.DA_APPROVARE) per[t.idUtente] = p.copy(inAttesa = centesimi(p.inAttesa + r.totale))
        }
        return per.values.filter { it.totale > 0 || it.inAttesa > 0 }
            .sortedWith(compareBy<RimborsoPersona> { it.idUtente.toLongOrNull() ?: Long.MAX_VALUE }.thenBy { it.idUtente })
    }

    /**
     * I totali delle spese (i tre riquadri, §14.8), delle righe non respinte:
     * daRimborsare = pagate da chi le ha scritte, non "Mia", non rimborsate,
     * mandate o approvate. Si rifanno sul telefono quando ci sono spese in coda.
     */
    fun totaliSpese(spese: List<Spesa>): TotaliSpese {
        val vive = spese.filter { it.stato != StatoVoce.RESPINTA && it.tolta.isBlank() }
        fun somma(l: List<Spesa>) = l.fold(0.0) { a, s -> centesimi(a + s.importo) }
        return TotaliSpese(
            quante = vive.size,
            cliente = somma(vive.filter { it.destinazione == Destinazione.CLIENTE }),
            studio = somma(vive.filter { it.destinazione == Destinazione.STUDIO }),
            personale = somma(vive.filter { it.destinazione == Destinazione.PERSONALE }),
            daRimborsare = somma(vive.filter { it.pagataDaMe && it.destinazione != Destinazione.PERSONALE && it.rimborsataIl.isBlank() && StatoVoce.conta(it.stato) }),
            senzaFoto = vive.count { it.foto.isEmpty() && !it.fotoInCoda },
        )
    }
}

// ---------------------------------------------------------------------------------- ore

/** Una riga di ore (§14.3). [idLocale], [inCoda] ed [errore] sono del telefono: una riga ancora da mandare. */
data class RigaOre(
    val id: String = "",
    val idUtente: String = "",
    val utente: String = "",
    val data: LocalDate = LocalDate.now(),
    /** "HH:MM", vuote se le ore sono scritte a mano. */
    val inizio: String = "",
    val fine: String = "",
    val pausaMinuti: Int = 0,
    val ore: Double = 0.0,
    val giornoDopo: Boolean = false,
    /** "" = attività dello studio. */
    val idCommessa: String = "",
    val commessa: String = "",
    val idCliente: String = "",
    val cliente: String = "",
    val idPrestazione: String = "",
    val prestazione: String = "",
    val idAttivita: String = "",
    val attivita: String = "",
    val descrizione: String = "",
    val fatturabile: Boolean = false,
    /** "ordinaria" | "straordinaria". */
    val tipo: String = ORDINARIA,
    /** Solo con il permesso dei soldi. */
    val costoOrario: Double? = null,
    val costo: Double? = null,
    val stato: String = StatoVoce.BOZZA,
    val approvataDa: String = "",
    val approvataDaNome: String = "",
    val approvataIl: String = "",
    val motivoRifiuto: String = "",
    val dalTimer: Boolean = false,
    val tolta: String = "",
    val puoScrivere: Boolean = true,
    val bloccata: String = "",
    val creato: String = "",
    val modificato: String = "",
    /** Fase 5 (§16.2): il ticket delle ore (id interno, o l'idLocale di uno nato qui) e il suo numero. */
    val idTicket: String = "",
    val ticket: String = "",
    // ---- del telefono
    val idLocale: String = "",
    val inCoda: Boolean = false,
    val errore: String = "",
) {
    val straordinaria: Boolean get() = tipo == STRAORDINARIA
    val conOrari: Boolean get() = inizio.isNotBlank() && fine.isNotBlank()
    val studio: Boolean get() = idCommessa.isBlank()

    /** La chiave nella coda: l'id del server se c'è, altrimenti quello nato qui. */
    val chiave: String get() = if (id.isNotBlank()) "ore:$id" else idLocale

    /**
     * Il corpo di salvaOre (§14.4): solo i campi del modulo. Con inizio e fine le
     * ore le calcola il server; senza, si mandano inizio e fine vuoti e le ore.
     */
    fun perSalvare(bozza: Boolean = false): JSONObject {
        val o = JSONObject()
        if (id.isNotBlank()) o.put("id", PonteServer.idJson(id))
        o.put("data", data.toString())
        if (conOrari) {
            o.put("inizio", inizio).put("fine", fine).put("pausaMinuti", pausaMinuti)
        } else {
            o.put("inizio", inizio).put("fine", "").put("ore", ore)
        }
        o.put("idCommessa", idCommessa)
            .put("idPrestazione", idPrestazione.takeIf { it.isNotBlank() }?.let(PonteServer::idJson) ?: JSONObject.NULL)
            .put("idAttivita", idAttivita.takeIf { it.isNotBlank() }?.let(PonteServer::idJson) ?: JSONObject.NULL)
            .put("descrizione", descrizione.trim())
            .put("fatturabile", fatturabile)
            .put("tipo", tipo)
        if (idTicket.isNotBlank()) o.put("idTicket", PonteServer.idJson(idTicket))
        if (bozza) o.put("bozza", true)
        return o
    }

    companion object {
        const val ORDINARIA = "ordinaria"
        const val STRAORDINARIA = "straordinaria"

        fun nuovoIdLocale(): String = "O-" + UUID.randomUUID().toString().replace("-", "").take(16)

        fun daJson(o: JSONObject) = RigaOre(
            id = o.testo("id"),
            idUtente = o.testo("idUtente"),
            utente = o.testo("utente"),
            data = o.data("data") ?: LocalDate.now(),
            inizio = o.testo("inizio"),
            fine = o.testo("fine"),
            pausaMinuti = (o.numero("pausaMinuti") ?: 0.0).toInt(),
            ore = o.numero("ore") ?: 0.0,
            giornoDopo = o.vero("giornoDopo"),
            idCommessa = o.testo("idCommessa"),
            commessa = o.testo("commessa"),
            idCliente = o.testo("idCliente"),
            cliente = o.testo("cliente"),
            idPrestazione = o.testo("idPrestazione"),
            prestazione = o.testo("prestazione"),
            idAttivita = o.testo("idAttivita"),
            attivita = o.testo("attivita"),
            descrizione = o.testo("descrizione"),
            fatturabile = o.vero("fatturabile"),
            tipo = o.testo("tipo").ifBlank { ORDINARIA },
            costoOrario = o.numero("costoOrario"),
            costo = o.numero("costo"),
            stato = o.testo("stato").ifBlank { StatoVoce.BOZZA },
            approvataDa = o.testo("approvataDa"),
            approvataDaNome = o.testo("approvataDaNome"),
            approvataIl = o.testo("approvataIl"),
            motivoRifiuto = o.testo("motivoRifiuto"),
            dalTimer = o.vero("dalTimer"),
            tolta = o.testo("tolta"),
            puoScrivere = o.booleanoONull("puoScrivere") ?: true,
            bloccata = o.testo("bloccata"),
            creato = o.testo("creato"),
            modificato = o.testo("modificato"),
            idTicket = o.testo("idTicket"),
            ticket = o.testo("ticket"),
        )

        /**
         * Una riga ancora in coda, dal corpo mandato a salvaOre: quello che si vede
         * finché il server non risponde. [prima] è la riga com'era (per le modifiche).
         */
        fun daCorpo(corpo: JSONObject, idLocale: String, idRemoto: String, prima: RigaOre?, ana: Anagrafiche, statoPrevisto: String): RigaOre {
            val inizio = corpo.testo("inizio")
            val fine = corpo.testo("fine")
            val pausa = (corpo.numero("pausaMinuti") ?: 0.0).toInt()
            val calcolate = if (inizio.isNotBlank() && fine.isNotBlank()) runCatching { ContiOreSpese.oreDaOrari(inizio, fine, pausa) }.getOrNull() else null
            val idCommessa = corpo.testo("idCommessa")
            val m = ana.commessa(idCommessa)
            val bozza = corpo.vero("bozza")
            return (prima ?: RigaOre()).copy(
                id = idRemoto.ifBlank { corpo.testo("id") }.ifBlank { prima?.id.orEmpty() },
                data = corpo.data("data") ?: prima?.data ?: LocalDate.now(),
                inizio = calcolate?.inizio ?: inizio,
                fine = calcolate?.fine ?: fine,
                pausaMinuti = if (calcolate != null) pausa else 0,
                ore = calcolate?.ore ?: (corpo.numero("ore") ?: 0.0),
                giornoDopo = calcolate?.giornoDopo ?: false,
                idCommessa = m?.id ?: idCommessa,
                commessa = m?.descrizione ?: prima?.commessa.orEmpty().takeIf { idCommessa.equals(prima?.idCommessa, ignoreCase = true) }.orEmpty(),
                idCliente = m?.idCliente.orEmpty(),
                cliente = m?.idCliente?.let { ana.cliente(it)?.nome }.orEmpty(),
                idPrestazione = corpo.testo("idPrestazione"),
                prestazione = ana.prestazioni.firstOrNull { it.id == corpo.testo("idPrestazione") }?.nome.orEmpty(),
                idAttivita = corpo.testo("idAttivita"),
                descrizione = corpo.testo("descrizione"),
                fatturabile = corpo.vero("fatturabile"),
                tipo = corpo.testo("tipo").ifBlank { ORDINARIA },
                stato = when {
                    bozza -> StatoVoce.BOZZA
                    prima != null && prima.stato != StatoVoce.BOZZA && prima.stato != StatoVoce.RESPINTA && !prima.puoScrivere -> prima.stato
                    else -> statoPrevisto
                },
                motivoRifiuto = if (bozza) prima?.motivoRifiuto.orEmpty() else "",
                idLocale = idLocale,
                inCoda = true,
            )
        }
    }
}

/** Un giorno del periodo (§14.3): le ore registrate (non respinte) e quelle dei rapportini. */
data class GiornoOre(val data: LocalDate, val ore: Double = 0.0, val oreRapportini: Double = 0.0) {
    val tutte: Double get() = Math.floor((ore + oreRapportini) * 100 + 0.5) / 100.0
}

data class TotaliOre(
    val ore: Double = 0.0,
    val fatturabili: Double = 0.0,
    val straordinarie: Double = 0.0,
    val oreRapportini: Double = 0.0,
    val daApprovare: Int = 0,
)

/** La risposta di `ore {da, a, ...}` (§14.3). [grezzo] è il JSON, per la copia sul telefono. */
data class ElencoOre(
    val da: LocalDate,
    val a: LocalDate,
    val oreGiornaliere: Double = 8.0,
    val ore: List<RigaOre> = emptyList(),
    val giorni: List<GiornoOre> = emptyList(),
    val totali: TotaliOre = TotaliOre(),
    val grezzo: JSONObject? = null,
) {
    companion object {
        fun daJson(o: JSONObject): ElencoOre {
            val t = o.optJSONObject("totali")
            val oggi = LocalDate.now()
            return ElencoOre(
                da = o.data("da") ?: oggi.with(DayOfWeek.MONDAY),
                a = o.data("a") ?: oggi.with(DayOfWeek.SUNDAY),
                oreGiornaliere = o.numero("oreGiornaliere") ?: 8.0,
                ore = o.optJSONArray("ore").oggetti().map(RigaOre::daJson).filter { it.tolta.isBlank() },
                giorni = o.optJSONArray("giorni").oggetti().mapNotNull { g -> g.data("data")?.let { GiornoOre(it, g.numero("ore") ?: 0.0, g.numero("oreRapportini") ?: 0.0) } },
                totali = TotaliOre(
                    ore = t?.numero("ore") ?: 0.0,
                    fatturabili = t?.numero("fatturabili") ?: 0.0,
                    straordinarie = t?.numero("straordinarie") ?: 0.0,
                    oreRapportini = t?.numero("oreRapportini") ?: 0.0,
                    daApprovare = t?.optInt("daApprovare") ?: 0,
                ),
                grezzo = o,
            )
        }
    }
}

/**
 * Il timer letto dal server (§14.5). [secondi] e [adesso] sono del server: il
 * telefono fa scorrere il tempo da lì, contando quanto è passato da [lettoAlMs]
 * col suo orologio (che può essere sbagliato, ma conta bene i secondi che passano).
 */
data class TimerLetto(
    val timer: TimerAcceso?,
    val adesso: String = "",
    val lettoAlMs: Long = 0L,
) {
    val acceso: Boolean get() = timer != null

    /** I secondi del timer adesso, [oraMs] col contatore del telefono. */
    fun secondi(oraMs: Long): Long = timer?.let { it.secondi + ((oraMs - lettoAlMs).coerceAtLeast(0L) / 1000) } ?: 0L

    companion object {
        fun daJson(o: JSONObject, lettoAlMs: Long) = TimerLetto(o.optJSONObject("timer")?.let(TimerAcceso::daJson), o.testo("adesso"), lettoAlMs)
    }
}

data class TimerAcceso(
    val partitoIl: String,
    val idCommessa: String = "",
    val commessa: String = "",
    val idPrestazione: String = "",
    val idAttivita: String = "",
    val descrizione: String = "",
    val fatturabile: Boolean = false,
    val secondi: Long = 0L,
) {
    /** "8:12": l'ora in cui è partito. */
    val dalle: String get() = partitoIl.drop(11).take(5).removePrefix("0")
    val giorno: LocalDate? get() = runCatching { LocalDate.parse(partitoIl.take(10)) }.getOrNull()

    fun aJson(): JSONObject = JSONObject().put("partitoIl", partitoIl).put("idCommessa", idCommessa).put("commessa", commessa)
        .put("idPrestazione", idPrestazione).put("idAttivita", idAttivita).put("descrizione", descrizione)
        .put("fatturabile", fatturabile).put("secondi", secondi)

    companion object {
        fun daJson(o: JSONObject) = TimerAcceso(
            partitoIl = o.testo("partitoIl"),
            idCommessa = o.testo("idCommessa"),
            commessa = o.testo("commessa"),
            idPrestazione = o.testo("idPrestazione"),
            idAttivita = o.testo("idAttivita"),
            descrizione = o.testo("descrizione"),
            fatturabile = o.vero("fatturabile"),
            secondi = (o.numero("secondi") ?: 0.0).toLong(),
        )

        /** 5432 -> "01:30:32": il tempo grande del timer. */
        fun durata(secondi: Long): String {
            val s = secondi.coerceAtLeast(0)
            return "%02d:%02d:%02d".format(s / 3600, (s / 60) % 60, s % 60)
        }
    }
}

/** Quello che dà fermaTimer: la bozza da correggere, e un avviso se era acceso da più di un giorno. */
data class TimerFermato(val riga: RigaOre, val avviso: String = "")

// ---------------------------------------------------------------------------------- approvazioni

data class Anomalia(val tipo: String, val testo: String)

/** Una cosa da approvare (§14.6): cosa e dettaglio sono già frasi da mostrare. */
data class VoceDaApprovare(
    /** "ore" | "rapportino" | "spesa" | "trasferta". */
    val tipo: String,
    val id: String,
    val idUtente: String = "",
    val data: LocalDate? = null,
    val cosa: String = "",
    val dettaglio: String = "",
    val quanto: Double? = null,
    /** "ore" | "euro". */
    val unita: String = "",
    val km: Double? = null,
    val anomalie: List<Anomalia> = emptyList(),
) {
    /** La chiave della selezione: tipo e id insieme (un'ora 7 e una spesa 7 sono cose diverse). */
    val chiave: String get() = "$tipo:$id"

    /** "8 h", "230,00 €". */
    val quantoTesto: String
        get() = when {
            quanto == null -> ""
            unita == "ore" -> Numeri.ore(quanto)
            unita == "euro" -> Numeri.euro(quanto)
            else -> Numeri.scrivi(quanto)
        }

    fun perServer(): JSONObject = JSONObject().put("tipo", tipo).put("id", if (tipo == "rapportino") id else PonteServer.idJson(id))

    companion object {
        fun daJson(o: JSONObject) = VoceDaApprovare(
            tipo = o.testo("tipo"),
            id = o.testo("id"),
            idUtente = o.testo("idUtente"),
            data = o.data("data"),
            cosa = o.testo("cosa"),
            dettaglio = o.testo("dettaglio"),
            quanto = o.numero("quanto"),
            unita = o.testo("unita"),
            km = o.numero("km"),
            anomalie = o.optJSONArray("anomalie").oggetti().map { Anomalia(it.testo("tipo"), it.testo("testo")) },
        )
    }
}

data class PersonaDaApprovare(val idUtente: String, val nome: String, val quante: Int, val conAnomalie: Int, val voci: List<VoceDaApprovare>)

data class DaApprovare(val oggi: LocalDate? = null, val quante: Int = 0, val conAnomalie: Int = 0, val persone: List<PersonaDaApprovare> = emptyList()) {
    val voci: List<VoceDaApprovare> get() = persone.flatMap { it.voci }

    /** Tutte scelte all'inizio: si tolgono le eccezioni (fase3.md §2, punto 6). */
    fun tutteLeChiavi(): Set<String> = voci.map { it.chiave }.toSet()

    /** Le voci scelte, nell'ordine dell'elenco. Le chiavi che non ci sono più si ignorano. */
    fun scelte(chiavi: Set<String>): List<VoceDaApprovare> = voci.filter { it.chiave in chiavi }

    /** "Seleziona tutto" se manca qualcosa, altrimenti "Togli la selezione": torna la selezione nuova. */
    fun selezionaTutto(chiavi: Set<String>): Set<String> = if (voci.all { it.chiave in chiavi }) emptySet() else tutteLeChiavi()

    /**
     * Senza le righe di ore (07/11/2026: le Ore non ci sono più, restano i rapportini e le spese).
     * Un server di prima le manda ancora: si tolgono qui, coi conti rifatti.
     */
    fun senzaOre(): DaApprovare = if (voci.none { it.tipo == "ore" }) this else senza(voci.filter { it.tipo == "ore" }.map { it.chiave }.toSet())

    /** Toglie le voci già decise (dopo Approva o Respingi), senza rileggere. */
    fun senza(chiavi: Set<String>): DaApprovare {
        val persone2 = persone.map { p ->
            val v = p.voci.filterNot { it.chiave in chiavi }
            p.copy(voci = v, quante = v.size, conAnomalie = v.count { it.anomalie.isNotEmpty() })
        }.filter { it.voci.isNotEmpty() }
        return copy(persone = persone2, quante = persone2.sumOf { it.quante }, conAnomalie = persone2.sumOf { it.conAnomalie })
    }

    companion object {
        fun daJson(o: JSONObject) = DaApprovare(
            oggi = o.data("oggi"),
            quante = o.optInt("quante"),
            conAnomalie = o.optInt("conAnomalie"),
            persone = o.optJSONArray("persone").oggetti().map { p ->
                PersonaDaApprovare(p.testo("idUtente"), p.testo("nome"), p.optInt("quante"), p.optInt("conAnomalie"), p.optJSONArray("voci").oggetti().map(VoceDaApprovare::daJson))
            },
        )
    }
}

/** Quello che dicono approva, respingi e annullaApprovazione: quante sono cambiate davvero. */
data class EsitoApprovazione(val fatte: Int, val voci: List<Pair<String, String>> = emptyList()) {
    companion object {
        fun daJson(o: JSONObject) = EsitoApprovazione(o.optInt("fatte"), o.optJSONArray("voci").oggetti().map { (it.testo("tipo") + ":" + it.testo("id")) to it.testo("stato") })
    }
}

// ---------------------------------------------------------------------------------- spese

/** Una spesa (§14.8). [fotoInCoda] è del telefono: lo scontrino scattato e non ancora partito. */
data class Spesa(
    val id: String = "",
    val idUtente: String = "",
    val utente: String = "",
    val data: LocalDate = LocalDate.now(),
    val importo: Double = 0.0,
    val categoria: String = "altro",
    val descrizione: String = "",
    val idCommessa: String = "",
    val commessa: String = "",
    val idCliente: String = "",
    val cliente: String = "",
    val idRapportino: String = "",
    val idTrasferta: String = "",
    val destinazione: String = Destinazione.STUDIO,
    val anticipazione: Boolean = false,
    val pagataDaMe: Boolean = false,
    val stato: String = StatoVoce.BOZZA,
    val approvataDa: String = "",
    val approvataDaNome: String = "",
    val approvataIl: String = "",
    val motivoRifiuto: String = "",
    val rimborsataIl: String = "",
    val fatturataIl: String = "",
    val dalRapportino: Boolean = false,
    val foto: List<FileRemoto> = emptyList(),
    val tolta: String = "",
    val puoScrivere: Boolean = true,
    val bloccata: String = "",
    /** null, oppure i soli campi che si possono cambiare (spesa di un rapportino firmato). */
    val soloCampi: List<String>? = null,
    val creato: String = "",
    val modificato: String = "",
    /** Fase 5 (§16.2): il ticket della spesa (quelle di un rapportino hanno quello del rapportino). */
    val idTicket: String = "",
    val ticket: String = "",
    /** Fase 6 (§7.4): il mezzo di carburante, pedaggio e parcheggio, e i km del contachilometri del rifornimento. */
    val idVeicolo: String = "",
    val km: Long? = null,
    // ---- del telefono
    val idLocale: String = "",
    val inCoda: Boolean = false,
    val fotoInCoda: Boolean = false,
    /** Il mezzo si è chiesto (c'erano mezzi e la categoria lo vuole): si manda, anche vuoto. */
    val mezzoChiesto: Boolean = false,
    val errore: String = "",
) {
    val chiave: String get() = if (id.isNotBlank()) "spesa:$id" else idLocale

    /** Si può cambiare questo campo? (soloCampi delle spese di un rapportino firmato.) */
    fun cambia(campo: String): Boolean = puoScrivere && (soloCampi == null || campo in soloCampi)

    /** Il corpo di salvaSpesa (§14.8): "L'ho pagata io" si manda sempre. */
    fun perSalvare(bozza: Boolean = false): JSONObject {
        val o = JSONObject()
        if (id.isNotBlank()) o.put("id", PonteServer.idJson(id))
        if (soloCampi != null) {
            // Spesa di un rapportino firmato: si mandano solo i campi che si possono cambiare.
            if ("categoria" in soloCampi) o.put("categoria", categoria)
            if ("descrizione" in soloCampi) o.put("descrizione", descrizione.trim())
            if ("pagataDaMe" in soloCampi) o.put("pagataDaMe", pagataDaMe)
            return o
        }
        o.put("data", data.toString())
            .put("importo", importo)
            .put("categoria", categoria)
            .put("descrizione", descrizione.trim())
            .put("idCommessa", idCommessa)
            .put("destinazione", destinazione)
            .put("anticipazione", destinazione == Destinazione.CLIENTE && anticipazione)
            .put("pagataDaMe", pagataDaMe)
        if (idCliente.isNotBlank() && idCommessa.isBlank()) o.put("idCliente", idCliente)
        if (idTrasferta.isNotBlank()) o.put("idTrasferta", PonteServer.idJson(idTrasferta))
        if (idTicket.isNotBlank() && idRapportino.isBlank()) o.put("idTicket", PonteServer.idJson(idTicket))
        if (mezzoChiesto && categoria in CategoriaSpesa.CON_MEZZO) {
            o.put("idVeicolo", if (idVeicolo.isBlank()) JSONObject.NULL else PonteServer.idJson(idVeicolo))
            if (categoria == "carburante" && idVeicolo.isNotBlank() && km != null) o.put("km", km)
        }
        if (bozza) o.put("bozza", true)
        return o
    }

    companion object {
        fun nuovoIdLocale(): String = "S-" + UUID.randomUUID().toString().replace("-", "").take(16)

        fun daJson(o: JSONObject) = Spesa(
            id = o.testo("id"),
            idUtente = o.testo("idUtente"),
            utente = o.testo("utente"),
            data = o.data("data") ?: LocalDate.now(),
            importo = o.numero("importo") ?: 0.0,
            categoria = o.testo("categoria").ifBlank { "altro" },
            descrizione = o.testo("descrizione"),
            idCommessa = o.testo("idCommessa"),
            commessa = o.testo("commessa"),
            idCliente = o.testo("idCliente"),
            cliente = o.testo("cliente"),
            idRapportino = o.testo("idRapportino"),
            idTrasferta = o.testo("idTrasferta"),
            destinazione = o.testo("destinazione").ifBlank { Destinazione.STUDIO },
            anticipazione = o.vero("anticipazione"),
            pagataDaMe = o.vero("pagataDaMe"),
            stato = o.testo("stato").ifBlank { StatoVoce.BOZZA },
            approvataDa = o.testo("approvataDa"),
            approvataDaNome = o.testo("approvataDaNome"),
            approvataIl = o.testo("approvataIl"),
            motivoRifiuto = o.testo("motivoRifiuto"),
            rimborsataIl = o.testo("rimborsataIl"),
            fatturataIl = o.testo("fatturataIl"),
            dalRapportino = o.vero("dalRapportino"),
            foto = o.optJSONArray("foto").oggetti().map(FileRemoto::daJson).filter { it.id.isNotBlank() },
            tolta = o.testo("tolta"),
            puoScrivere = o.booleanoONull("puoScrivere") ?: true,
            bloccata = o.testo("bloccata"),
            soloCampi = if (o.has("soloCampi") && !o.isNull("soloCampi")) o.optJSONArray("soloCampi")?.stringhe() else null,
            creato = o.testo("creato"),
            modificato = o.testo("modificato"),
            idTicket = o.testo("idTicket"),
            ticket = o.testo("ticket"),
            idVeicolo = o.testo("idVeicolo"),
            km = o.numero("km")?.toLong(),
        )

        /** Una spesa ancora in coda, dal corpo di salvaSpesa: quello che si vede finché il server non risponde. */
        fun daCorpo(corpo: JSONObject, idLocale: String, idRemoto: String, prima: Spesa?, ana: Anagrafiche, statoPrevisto: String, conFoto: Boolean): Spesa {
            val p = prima ?: Spesa()
            fun t(campo: String, altrimenti: String) = if (corpo.has(campo)) corpo.testo(campo) else altrimenti
            val idCommessa = t("idCommessa", p.idCommessa)
            val m = ana.commessa(idCommessa)
            val idCliente = m?.idCliente ?: t("idCliente", p.idCliente)
            val bozza = corpo.vero("bozza")
            return p.copy(
                id = idRemoto.ifBlank { corpo.testo("id") }.ifBlank { p.id },
                data = corpo.data("data") ?: p.data,
                importo = corpo.numero("importo") ?: p.importo,
                categoria = t("categoria", p.categoria).ifBlank { "altro" },
                descrizione = t("descrizione", p.descrizione),
                idCommessa = m?.id ?: idCommessa,
                commessa = m?.descrizione ?: p.commessa.takeIf { idCommessa.equals(p.idCommessa, ignoreCase = true) }.orEmpty(),
                idCliente = idCliente,
                cliente = ana.cliente(idCliente)?.nome ?: p.cliente,
                idTrasferta = t("idTrasferta", p.idTrasferta),
                idVeicolo = t("idVeicolo", p.idVeicolo),
                km = if (corpo.has("km")) corpo.numero("km")?.toLong() else p.km,
                destinazione = t("destinazione", p.destinazione).let { if (it == "mia") Destinazione.PERSONALE else it }.ifBlank { Destinazione.STUDIO },
                anticipazione = if (corpo.has("anticipazione")) corpo.vero("anticipazione") else p.anticipazione,
                pagataDaMe = if (corpo.has("pagataDaMe")) corpo.vero("pagataDaMe") else p.pagataDaMe,
                stato = when {
                    p.idRapportino.isNotBlank() -> p.stato
                    bozza -> StatoVoce.BOZZA
                    prima != null && prima.stato == StatoVoce.APPROVATA && prima.puoScrivere -> prima.stato
                    else -> statoPrevisto
                },
                motivoRifiuto = if (bozza) p.motivoRifiuto else "",
                idLocale = idLocale,
                inCoda = true,
                fotoInCoda = conFoto || p.fotoInCoda,
            )
        }
    }
}

data class TotaliSpese(
    val quante: Int = 0,
    val cliente: Double = 0.0,
    val studio: Double = 0.0,
    val personale: Double = 0.0,
    val daRimborsare: Double = 0.0,
    val senzaFoto: Int = 0,
) {
    companion object {
        fun daJson(t: JSONObject?) = TotaliSpese(
            quante = t?.optInt("quante") ?: 0,
            cliente = t?.numero("cliente") ?: 0.0,
            studio = t?.numero("studio") ?: 0.0,
            personale = t?.numero("personale") ?: 0.0,
            daRimborsare = t?.numero("daRimborsare") ?: 0.0,
            senzaFoto = t?.optInt("senzaFoto") ?: 0,
        )
    }
}

/** La risposta di `spese {da, a, ...}` (§14.8): i più recenti prima. */
data class ElencoSpese(
    val da: LocalDate,
    val a: LocalDate,
    val spese: List<Spesa> = emptyList(),
    val totali: TotaliSpese = TotaliSpese(),
    val grezzo: JSONObject? = null,
) {
    companion object {
        fun daJson(o: JSONObject): ElencoSpese {
            val oggi = LocalDate.now()
            return ElencoSpese(
                da = o.data("da") ?: oggi.withDayOfMonth(1),
                a = o.data("a") ?: oggi.withDayOfMonth(oggi.lengthOfMonth()),
                spese = o.optJSONArray("spese").oggetti().map(Spesa::daJson).filter { it.tolta.isBlank() },
                totali = TotaliSpese.daJson(o.optJSONObject("totali")),
                grezzo = o,
            )
        }
    }
}

// ---------------------------------------------------------------------------------- trasferte e veicoli

/** Una trasferta (§14.9). euroKm e veicolo sono congelati alla nascita. */
data class Trasferta(
    val id: String = "",
    val idUtente: String = "",
    val utente: String = "",
    val dal: LocalDate = LocalDate.now(),
    val al: LocalDate = dal,
    val giorni: Int = 1,
    val destinazione: String = "",
    val motivo: String = "",
    val idCommessa: String = "",
    val commessa: String = "",
    val idCliente: String = "",
    val cliente: String = "",
    val km: Double = 0.0,
    val andataRitorno: Boolean = true,
    val kmTotali: Double = 0.0,
    val idVeicolo: String = "",
    val veicolo: String = "",
    val euroKm: Double? = null,
    /** Fase 6 (§3.7): fatta con un mezzo dello studio, niente rimborso km. */
    val mezzoDelloStudio: Boolean = false,
    val rimborsoKm: Double = 0.0,
    val indennita: Double = 0.0,
    val totale: Double = 0.0,
    val stato: String = StatoVoce.BOZZA,
    val approvataDa: String = "",
    val approvataDaNome: String = "",
    val approvataIl: String = "",
    val motivoRifiuto: String = "",
    val rimborsataIl: String = "",
    val spese: List<Spesa> = emptyList(),
    val speseTotale: Double = 0.0,
    val tolta: String = "",
    val puoScrivere: Boolean = true,
    val bloccata: String = "",
    val creato: String = "",
    val modificato: String = "",
) {
    /** Il corpo di salvaTrasferta (§14.9). */
    fun perSalvare(): JSONObject {
        val o = JSONObject()
        if (id.isNotBlank()) o.put("id", PonteServer.idJson(id))
        o.put("dal", dal.toString()).put("al", al.toString())
            .put("destinazione", destinazione.trim()).put("motivo", motivo.trim())
            .put("idCommessa", idCommessa)
            .put("km", km).put("andataRitorno", andataRitorno)
            .put("indennita", indennita)
        if (idVeicolo.isNotBlank()) o.put("idVeicolo", PonteServer.idJson(idVeicolo))
        return o
    }

    companion object {
        fun daJson(o: JSONObject): Trasferta {
            val dal = o.data("dal") ?: LocalDate.now()
            return Trasferta(
                id = o.testo("id"),
                idUtente = o.testo("idUtente"),
                utente = o.testo("utente"),
                dal = dal,
                al = o.data("al") ?: dal,
                giorni = o.optInt("giorni", 1),
                destinazione = o.testo("destinazione"),
                motivo = o.testo("motivo"),
                idCommessa = o.testo("idCommessa"),
                commessa = o.testo("commessa"),
                idCliente = o.testo("idCliente"),
                cliente = o.testo("cliente"),
                km = o.numero("km") ?: 0.0,
                andataRitorno = o.vero("andataRitorno"),
                kmTotali = o.numero("kmTotali") ?: 0.0,
                idVeicolo = o.testo("idVeicolo"),
                veicolo = o.testo("veicolo"),
                euroKm = o.numero("euroKm"),
                mezzoDelloStudio = o.vero("mezzoDelloStudio"),
                rimborsoKm = o.numero("rimborsoKm") ?: 0.0,
                indennita = o.numero("indennita") ?: 0.0,
                totale = o.numero("totale") ?: 0.0,
                stato = o.testo("stato").ifBlank { StatoVoce.BOZZA },
                approvataDa = o.testo("approvataDa"),
                approvataDaNome = o.testo("approvataDaNome"),
                approvataIl = o.testo("approvataIl"),
                motivoRifiuto = o.testo("motivoRifiuto"),
                rimborsataIl = o.testo("rimborsataIl"),
                spese = o.optJSONArray("spese").oggetti().map(Spesa::daJson),
                speseTotale = o.numero("speseTotale") ?: 0.0,
                tolta = o.testo("tolta"),
                puoScrivere = o.booleanoONull("puoScrivere") ?: true,
                bloccata = o.testo("bloccata"),
                creato = o.testo("creato"),
                modificato = o.testo("modificato"),
            )
        }
    }
}

data class TotaliTrasferte(val quante: Int = 0, val km: Double = 0.0, val rimborsoKm: Double = 0.0, val indennita: Double = 0.0, val totale: Double = 0.0, val daRimborsare: Double = 0.0) {
    companion object {
        fun daJson(t: JSONObject?) = TotaliTrasferte(
            t?.optInt("quante") ?: 0, t?.numero("km") ?: 0.0, t?.numero("rimborsoKm") ?: 0.0,
            t?.numero("indennita") ?: 0.0, t?.numero("totale") ?: 0.0, t?.numero("daRimborsare") ?: 0.0,
        )
    }
}

data class ElencoTrasferte(val da: LocalDate, val a: LocalDate, val trasferte: List<Trasferta> = emptyList(), val totali: TotaliTrasferte = TotaliTrasferte(), val grezzo: JSONObject? = null) {
    companion object {
        fun daJson(o: JSONObject): ElencoTrasferte {
            val oggi = LocalDate.now()
            return ElencoTrasferte(
                da = o.data("da") ?: oggi.withDayOfMonth(1),
                a = o.data("a") ?: oggi.withDayOfMonth(oggi.lengthOfMonth()),
                trasferte = o.optJSONArray("trasferte").oggetti().map(Trasferta::daJson).filter { it.tolta.isBlank() },
                totali = TotaliTrasferte.daJson(o.optJSONObject("totali")),
                grezzo = o,
            )
        }
    }
}

/** Un veicolo col suo euro al km (le tabelle ACI dell'anno). */
data class Veicolo(
    val id: String = "",
    val nome: String = "",
    val alimentazione: String = "",
    val euroKm: Double? = null,
    val annoAci: Int? = null,
    val attivo: Boolean = true,
    val trasferte: Int = 0,
    /** Fase 6: "Fiat Doblò GA123BC", di chi è ("studio" o "persona"), fermo per un guasto. */
    val titolo: String = "",
    val proprieta: String = "persona",
    val fermo: Boolean = false,
) {
    val delloStudio: Boolean get() = proprieta == "studio"

    fun perSalvare(): JSONObject {
        val o = JSONObject().put("nome", nome.trim()).put("alimentazione", alimentazione.trim())
            .put("euroKm", euroKm ?: JSONObject.NULL).put("attivo", attivo)
        if (annoAci != null) o.put("annoAci", annoAci)
        if (id.isNotBlank()) o.put("id", PonteServer.idJson(id))
        return o
    }

    /** "0,76 €/km" (fino a quattro decimali, come le tabelle ACI). */
    val euroKmTesto: String
        get() = euroKm?.let { java.text.DecimalFormat("0.00##", java.text.DecimalFormatSymbols(IT)).format(it) + " €/km" } ?: "senza €/km"

    companion object {
        fun daJson(o: JSONObject) = Veicolo(
            id = o.testo("id"),
            nome = o.testo("nome"),
            alimentazione = o.testo("alimentazione"),
            euroKm = o.numero("euroKm"),
            annoAci = o.numero("annoAci")?.toInt(),
            attivo = o.booleanoONull("attivo") ?: true,
            trasferte = o.optInt("trasferte"),
            titolo = o.testo("titolo"),
            proprieta = o.testo("proprieta").ifBlank { "persona" },
            fermo = o.vero("fermo"),
        )
    }
}

data class ElencoVeicoli(val aciAnno: Int? = null, val paginaAci: String = "", val veicoli: List<Veicolo> = emptyList()) {
    companion object {
        fun daJson(o: JSONObject) = ElencoVeicoli(o.numero("aciAnno")?.toInt(), o.testo("paginaAci"), o.optJSONArray("veicoli").oggetti().map(Veicolo::daJson))
    }
}

// ---------------------------------------------------------------------------------- rimborsi e riepiloghi

data class VoceRimborso(
    /** "spesa" | "trasferta". */
    val tipo: String,
    val id: String,
    val data: LocalDate? = null,
    val descrizione: String = "",
    val categoria: String = "",
    val idCommessa: String = "",
    val importo: Double = 0.0,
    val km: Double? = null,
) {
    fun perServer(): JSONObject = JSONObject().put("tipo", tipo).put("id", PonteServer.idJson(id))

    companion object {
        fun daJson(o: JSONObject) = VoceRimborso(
            o.testo("tipo"), o.testo("id"), o.data("data"), o.testo("descrizione"), o.testo("categoria"),
            o.testo("idCommessa"), o.numero("importo") ?: 0.0, o.numero("km"),
        )
    }
}

data class RimborsoPersona(
    val idUtente: String,
    val nome: String = "",
    val totale: Double = 0.0,
    val inAttesa: Double = 0.0,
    val spese: Int = 0,
    val trasferte: Int = 0,
    val km: Double = 0.0,
    val voci: List<VoceRimborso> = emptyList(),
) {
    companion object {
        fun daJson(o: JSONObject) = RimborsoPersona(
            o.testo("idUtente"), o.testo("nome"), o.numero("totale") ?: 0.0, o.numero("inAttesa") ?: 0.0,
            o.optInt("spese"), o.optInt("trasferte"), o.numero("km") ?: 0.0, o.optJSONArray("voci").oggetti().map(VoceRimborso::daJson),
        )
    }
}

data class Rimborsi(val totale: Double = 0.0, val puoSegnare: Boolean = false, val persone: List<RimborsoPersona> = emptyList()) {
    companion object {
        fun daJson(o: JSONObject) = Rimborsi(o.numero("totale") ?: 0.0, o.vero("puoSegnare"), o.optJSONArray("persone").oggetti().map(RimborsoPersona::daJson))
    }
}

data class RigaRiepilogoSpese(
    val chiave: String,
    val nome: String,
    val quante: Int = 0,
    val cliente: Double = 0.0,
    val studio: Double = 0.0,
    val personale: Double = 0.0,
    val anticipazioni: Double = 0.0,
    val daRimborsare: Double = 0.0,
    val inAttesa: Double = 0.0,
    val trasferte: Int = 0,
    val km: Double = 0.0,
    val rimborsoKm: Double = 0.0,
    val indennita: Double = 0.0,
    val totale: Double = 0.0,
    /** Per commessa: il cliente della commessa ("cliente" è la somma delle spese al cliente). */
    val idCliente: String = "",
    val nomeCliente: String = "",
) {
    companion object {
        fun daJson(o: JSONObject) = RigaRiepilogoSpese(
            idCliente = o.testo("idCliente"),
            nomeCliente = o.testo("nomeCliente"),
            chiave = o.testo("chiave"), nome = o.testo("nome"), quante = o.optInt("quante"),
            cliente = o.numero("cliente") ?: 0.0, studio = o.numero("studio") ?: 0.0, personale = o.numero("personale") ?: 0.0,
            anticipazioni = o.numero("anticipazioni") ?: 0.0, daRimborsare = o.numero("daRimborsare") ?: 0.0,
            inAttesa = o.numero("inAttesa") ?: 0.0, trasferte = o.optInt("trasferte"), km = o.numero("km") ?: 0.0,
            rimborsoKm = o.numero("rimborsoKm") ?: 0.0, indennita = o.numero("indennita") ?: 0.0, totale = o.numero("totale") ?: 0.0,
        )
    }
}

/** riepilogoSpese (§14.10): totale = cliente + studio + rimborso km + indennità (le "Mia" no). */
data class RiepilogoSpese(val per: String, val righe: List<RigaRiepilogoSpese> = emptyList(), val totale: RigaRiepilogoSpese? = null) {
    companion object {
        fun daJson(o: JSONObject) = RiepilogoSpese(
            o.testo("per"), o.optJSONArray("righe").oggetti().map(RigaRiepilogoSpese::daJson),
            o.optJSONObject("totale")?.let { RigaRiepilogoSpese.daJson(it.put("chiave", "").put("nome", "Totale")) },
        )
    }
}

// ---------------------------------------------------------------------------------- dashboard (§14.13)

data class NumeriOre(val settimana: Double = 0.0, val mese: Double = 0.0, val fatturabiliMese: Double = 0.0, val timerAcceso: Boolean = false)
data class NumeriApprovare(val voci: Int = 0, val conAnomalie: Int = 0)
data class NumeriRimborsi(val daFare: Double = 0.0, val persone: Int = 0)

/** I numeri della fase 3 nella dashboard; null quello che il ruolo non vede. */
data class NumeriFase3(val ore: NumeriOre? = null, val approvare: NumeriApprovare? = null, val rimborsi: NumeriRimborsi? = null) {
    companion object {
        fun daJson(numeri: JSONObject?): NumeriFase3 = NumeriFase3(
            ore = numeri?.optJSONObject("ore")?.let { NumeriOre(it.numero("settimana") ?: 0.0, it.numero("mese") ?: 0.0, it.numero("fatturabiliMese") ?: 0.0, it.vero("timerAcceso")) },
            approvare = numeri?.optJSONObject("approvare")?.let { NumeriApprovare(it.optInt("voci"), it.optInt("conAnomalie")) },
            rimborsi = numeri?.optJSONObject("rimborsi")?.let { NumeriRimborsi(it.numero("daFare") ?: 0.0, it.optInt("persone")) },
        )
    }
}

// ---------------------------------------------------------------------------------- in fila

/**
 * Le regole per mettere in fila ore e spese sul telefono: la settimana, le righe
 * di un giorno, le commesse recenti, quello che è ancora in coda.
 */
object FilaOreSpese {
    private val GIORNO_BREVE = DateTimeFormatter.ofPattern("EEE d", IT)

    /** Il lunedì della settimana di [d]. */
    fun lunedi(d: LocalDate): LocalDate = d.with(DayOfWeek.MONDAY)

    /**
     * I giorni da mostrare nella settimana: da lunedì a venerdì, più sabato e
     * domenica se hanno ore (chi lavora il sabato lo vede, gli altri no).
     */
    fun giorniSettimana(lunedi: LocalDate, elenco: ElencoOre?): List<GiornoOre> {
        val perGiorno = elenco?.giorni?.associateBy { it.data }.orEmpty()
        return (0L until 7L).map { lunedi.plusDays(it) }
            .map { d -> perGiorno[d] ?: GiornoOre(d) }
            .filter { it.data.dayOfWeek.value <= 5 || it.tutte > 0 }
    }

    /** Le righe di un giorno, in ordine di inizio (le scritte a mano dopo), come le dà il server. */
    fun righeDelGiorno(elenco: ElencoOre?, giorno: LocalDate): List<RigaOre> =
        elenco?.ore.orEmpty().filter { it.data == giorno && it.tolta.isBlank() }
            .sortedWith(compareBy<RigaOre> { it.inizio.ifBlank { "99:99" } }.thenBy { it.id.toLongOrNull() ?: Long.MAX_VALUE })

    /**
     * L'elenco con sopra le righe ancora in coda: una riga cambiata prende il posto
     * della sua, una nuova si aggiunge. I giorni e i totali si rifanno sempre dalle
     * righe, come li fa il server (le ore dei rapportini restano le sue): così una
     * riga tolta o cambiata qui si vede subito anche nei numeri.
     */
    fun oreConCoda(elenco: ElencoOre, inCoda: List<RigaOre>): ElencoOre {
        val perId = inCoda.filter { it.id.isNotBlank() }.associateBy { it.id }
        val nuove = inCoda.filter { it.id.isBlank() || elenco.ore.none { r -> r.id == it.id } }
            .filter { !it.data.isBefore(elenco.da) && !it.data.isAfter(elenco.a) }
        val righe = elenco.ore.map { perId[it.id] ?: it } + nuove
        val vive = righe.filter { it.stato != StatoVoce.RESPINTA && it.tolta.isBlank() }
        val oreRap = elenco.giorni.associate { it.data to it.oreRapportini }
        val giorni = generateSequence(elenco.da) { it.plusDays(1) }.takeWhile { !it.isAfter(elenco.a) }.map { d ->
            GiornoOre(d, arrotonda(vive.filter { it.data == d }.sumOf { it.ore }), oreRap[d] ?: 0.0)
        }.toList()
        return elenco.copy(
            ore = righe,
            giorni = giorni,
            totali = elenco.totali.copy(
                ore = arrotonda(vive.sumOf { it.ore }),
                fatturabili = arrotonda(vive.filter { it.fatturabile }.sumOf { it.ore }),
                straordinarie = arrotonda(vive.filter { it.straordinaria }.sumOf { it.ore }),
                daApprovare = righe.count { it.stato == StatoVoce.DA_APPROVARE },
            ),
        )
    }

    /** Lo stesso per le spese: le cambiate al loro posto, le nuove in cima; i totali si rifanno. */
    fun speseConCoda(elenco: ElencoSpese, inCoda: List<Spesa>): ElencoSpese {
        val perId = inCoda.filter { it.id.isNotBlank() }.associateBy { it.id }
        val nuove = inCoda.filter { it.id.isBlank() || elenco.spese.none { s -> s.id == it.id } }
            .filter { !it.data.isBefore(elenco.da) && !it.data.isAfter(elenco.a) }
        val spese = (nuove + elenco.spese.map { perId[it.id] ?: it })
            .sortedWith(compareByDescending<Spesa> { it.data }.thenByDescending { it.inCoda }.thenByDescending { it.id.toLongOrNull() ?: 0L })
        return elenco.copy(spese = spese, totali = ContiOreSpese.totaliSpese(spese))
    }

    /** Una commessa da proporre: il codice e il nome. "" = lo studio. */
    data class CommessaRecente(val id: String, val nome: String, val idCliente: String = "")

    /**
     * Le commesse usate di recente, la più recente prima, come le schede del
     * rapportino (fase3.md §2, punto 3): dai rapportini, dalle ore e dalle spese,
     * solo quelle aperte. Al massimo [quante].
     */
    fun commesseRecenti(
        ana: Anagrafiche,
        rapportini: List<Rapportino>,
        ore: List<RigaOre> = emptyList(),
        spese: List<Spesa> = emptyList(),
        quante: Int = 4,
    ): List<CommessaRecente> {
        data class Uso(val id: String, val quando: LocalDate)
        val usi = rapportini.filter { it.idCommessa.isNotBlank() && it.stato != Stato.ANNULLATO }.map { Uso(it.idCommessa, it.data) } +
            ore.filter { it.idCommessa.isNotBlank() }.map { Uso(it.idCommessa, it.data) } +
            spese.filter { it.idCommessa.isNotBlank() }.map { Uso(it.idCommessa, it.data) }
        val aperte = ana.commesse.filter { !it.archiviata && !it.modello && it.stato.equals("APERTA", ignoreCase = true) }
        val trovate = usi.sortedByDescending { it.quando }.map { it.id.uppercase() }.distinct()
            .mapNotNull { id -> aperte.firstOrNull { it.id.equals(id, ignoreCase = true) } }
        // Senza storia (un telefono nuovo): le commesse aperte, le ultime create prima.
        val elenco = trovate.ifEmpty { aperte.sortedByDescending { it.id } }
        return elenco.take(quante).map { CommessaRecente(it.id, it.descrizione, it.idCliente) }
    }

    /**
     * Lo stato che una riga avrà dopo il salvataggio, per mostrarla subito anche
     * senza rete (§14.1): con APPROVAZIONE "tutti" va da approvare, con
     * "collaboratori" solo per i collaboratori, con "nessuno" nasce approvata.
     */
    fun statoPrevisto(approvazione: String, ruolo: String): String = when (approvazione) {
        "tutti" -> StatoVoce.DA_APPROVARE
        "nessuno" -> StatoVoce.APPROVATA
        else -> if (ruolo == Ruoli.COLLABORATORE) StatoVoce.DA_APPROVARE else StatoVoce.APPROVATA
    }

    /** "lun 20". */
    fun giornoBreve(d: LocalDate): String = d.format(GIORNO_BREVE)

    /** "Lun". */
    fun nomeGiorno(d: LocalDate): String = d.dayOfWeek.getDisplayName(TextStyle.SHORT, IT).replaceFirstChar { it.uppercase() }

    /** Quante ore si vedono in un giorno con gli stepper: a mezz'ore, da mezz'ora a 24. */
    fun passo(ore: Double, delta: Double): Double = (Math.round((ore + delta) * 2) / 2.0).coerceIn(0.5, 24.0)

    private fun arrotonda(n: Double) = Math.floor(n * 100 + 0.5) / 100.0
}

/** I minuti di adesso per l'orario proposto (l'inizio del lavoro). */
internal fun LocalDateTime.oraBreve(): String = "%02d:%02d".format(hour, minute)

/** Per la coda: un JSONArray da una lista di JSONObject. */
internal fun List<JSONObject>.inArray(): JSONArray = JSONArray().apply { forEach { put(it) } }

/** Le frasi della coda quando dentro ci sono anche ore e spese, non solo rapportini. */
object TestiCoda {
    /** Il titolo della scheda rossa (e della notifica) quando il server dice di no. */
    fun rifiutata(tipo: CodaInvii.Tipo): String = when (tipo) {
        CodaInvii.Tipo.ORE -> "Il server non ha accettato delle ore"
        CodaInvii.Tipo.SPESA, CodaInvii.Tipo.FOTO_SPESA -> "Il server non ha accettato una spesa"
        CodaInvii.Tipo.TICKET, CodaInvii.Tipo.AZIONE_TICKET, CodaInvii.Tipo.FOTO_TICKET -> "Il server non ha accettato un ticket"
        CodaInvii.Tipo.FAI_SCADENZA -> "Il server non ha accettato una scadenza"
        // Fase 6: mai il tipo dell'assenza (potrebbe essere una malattia), nemmeno nel titolo.
        CodaInvii.Tipo.ASSENZA, CodaInvii.Tipo.ANNULLA_ASSENZA -> "Il server non ha accettato una richiesta"
        CodaInvii.Tipo.KM, CodaInvii.Tipo.FOTO_KM -> "Il server non ha accettato una lettura dei km"
        CodaInvii.Tipo.GUASTO, CodaInvii.Tipo.FOTO_GUASTO -> "Il server non ha accettato un guasto"
        CodaInvii.Tipo.PRESTITO, CodaInvii.Tipo.RESTITUISCI -> "Il server non ha accettato un prestito"
        CodaInvii.Tipo.FIRMA_DPI -> "Il server non ha accettato una firma"
        // Fase 7 (§3.20): il messaggio, la risposta, la pubblicazione o il file.
        CodaInvii.Tipo.AZIONE7 -> "Il server non ha accettato un'azione di comunicazioni o portale"
        else -> "Il server non ha accettato un rapportino"
    }

    fun titoloNonPartite(ops: List<CodaInvii.Operazione>): String = when {
        ops.all { it.delRapportino } -> "Rapportini non ancora partiti"
        ops.all { it.fase3 } -> "Ore e spese non ancora partite"
        ops.all { it.fase5 } -> "Ticket non ancora partiti"
        else -> "Modifiche non ancora partite"
    }

    /**
     * La pillola calma della rete: "2 rapportini partono appena c'è rete", "1 spesa
     * parte appena c'è rete", "3 righe di ore partono…", o "4 modifiche partono…"
     * quando sono di tipi diversi. Una spesa col suo scontrino conta una volta.
     * Null se non c'è niente in attesa.
     */
    fun inAttesa(ops: List<CodaInvii.Operazione>): String? {
        val vive = ops.filter { !it.rifiutata }
        // Fase 5 (fase5.md §3.9): "1 ticket e 1 rapportino partono appena c'è rete".
        val ticket = vive.filter { it.tipo == CodaInvii.Tipo.TICKET || it.tipo == CodaInvii.Tipo.AZIONE_TICKET || it.tipo == CodaInvii.Tipo.FOTO_TICKET }.map { it.idLocale }.distinct().size
        val scadenze = vive.count { it.tipo == CodaInvii.Tipo.FAI_SCADENZA }
        // Fase 6 (fase6.md §3.13): "1 richiesta di ferie e 2 letture dei km partono appena c'è rete".
        val sei = vive.filter { it.fase6 }
        // Fase 7 (fase7.md §3.20): "2 messaggi e 1 risposta partono appena c'è rete".
        val sette = vive.filter { it.fase7 }
        if (ticket > 0 || scadenze > 0 || sei.isNotEmpty() || sette.isNotEmpty()) {
            val rap = vive.filter { it.delRapportino }.map { it.idLocale }.distinct().size
            val altre = vive.count { it.fase3 }
            val pezzi6 = pezziFase6(sei) + pezziFase7(sette)
            val pezzi = listOfNotNull(
                ticket.takeIf { it > 0 }?.let { "$it ticket" },
                rap.takeIf { it > 0 }?.let { if (it == 1) "1 rapportino" else "$it rapportini" },
                scadenze.takeIf { it > 0 }?.let { if (it == 1) "1 scadenza" else "$it scadenze" },
                altre.takeIf { it > 0 }?.let { if (it == 1) "1 riga di ore o spese" else "$it righe di ore o spese" },
            ) + pezzi6.map { it.second }
            val tante = ticket + rap + scadenze + altre + pezzi6.sumOf { it.first } > 1
            return pezzi.joinToString(", ").replace(Regex(", ([^,]+)$"), " e $1") + if (tante) " partono appena c'è rete" else " parte appena c'è rete"
        }
        val rapportini = vive.count { !it.fase3 }
        val ore = vive.count { it.tipo == CodaInvii.Tipo.ORE }
        val spese = vive.filter { it.tipo == CodaInvii.Tipo.SPESA || it.tipo == CodaInvii.Tipo.FOTO_SPESA }.map { it.idLocale }.distinct().size
        val tipi = listOf(rapportini, ore, spese).count { it > 0 }
        fun frase(n: Int, uno: String, tanti: String) = if (n == 1) "1 $uno parte appena c'è rete" else "$n $tanti partono appena c'è rete"
        return when {
            tipi == 0 -> null
            tipi > 1 -> frase(rapportini + ore + spese, "modifica", "modifiche")
            rapportini > 0 -> frase(rapportini, "rapportino", "rapportini")
            ore > 0 -> frase(ore, "riga di ore", "righe di ore")
            else -> frase(spese, "spesa", "spese")
        }
    }

    /**
     * I pezzi della fase 6, ognuno col suo numero: le richieste (il tipo solo per ferie
     * e permessi: una malattia è "una richiesta", senza dirlo), le letture dei km (la
     * foto va con la sua lettura), i guasti (con le foto), i prestiti, le restituzioni,
     * le firme dei DPI.
     */
    /**
     * I pezzi della fase 7: i messaggi (preparati, mandati, non mandati, le telefonate e le
     * note), le risposte nel portale, le pubblicazioni (pubblica e togli), i file decisi.
     */
    fun pezziFase7(ops: List<CodaInvii.Operazione>): List<Pair<Int, String>> {
        fun quanti(n: Int, uno: String, tanti: String) = n to (if (n == 1) "1 $uno" else "$n $tanti")
        val azioni = ops.map { it.corpoJson().testo("azione") }
        val messaggi = ops.filter { it.corpoJson().testo("azione") in setOf("salvaMessaggio", "segnaMandato", "nonMandare") }.map { it.idLocale.substringAfter(':') }.distinct().size
        val risposte = azioni.count { it == "rispondiNelPortale" }
        val pubblicazioni = azioni.count { it == "pubblica" || it == "togliDalPortale" || it == "mostraNelPortale" }
        val file = azioni.count { it == "accettaCaricamento" || it == "rifiutaCaricamento" }
        val visti = azioni.count { it == "segnaVistoPortale" }
        return listOfNotNull(
            messaggi.takeIf { it > 0 }?.let { quanti(it, "messaggio", "messaggi") },
            risposte.takeIf { it > 0 }?.let { quanti(it, "risposta", "risposte") },
            pubblicazioni.takeIf { it > 0 }?.let { quanti(it, "cambio del portale", "cambi del portale") },
            file.takeIf { it > 0 }?.let { quanti(it, "file", "file") },
            visti.takeIf { it > 0 }?.let { quanti(it, "segnato visto", "segnati visti") },
        )
    }

    fun pezziFase6(ops: List<CodaInvii.Operazione>): List<Pair<Int, String>> {
        fun quanti(n: Int, uno: String, tanti: String) = n to (if (n == 1) "1 $uno" else "$n $tanti")
        val out = mutableListOf<Pair<Int, String>>()
        val richieste = ops.filter { it.tipo == CodaInvii.Tipo.ASSENZA || it.tipo == CodaInvii.Tipo.ANNULLA_ASSENZA }
        if (richieste.isNotEmpty()) {
            val tipi = richieste.map { if (it.tipo == CodaInvii.Tipo.ASSENZA) it.corpoJson().testo("tipo") else "" }.toSet()
            out += when (tipi.singleOrNull()) {
                "ferie" -> quanti(richieste.size, "richiesta di ferie", "richieste di ferie")
                "permesso" -> quanti(richieste.size, "richiesta di permesso", "richieste di permesso")
                else -> quanti(richieste.size, "richiesta", "richieste")
            }
        }
        val km = ops.filter { it.tipo == CodaInvii.Tipo.KM || it.tipo == CodaInvii.Tipo.FOTO_KM }.map { it.idLocale }.distinct().size
        if (km > 0) out += quanti(km, "lettura dei km", "letture dei km")
        val guasti = ops.filter { it.tipo == CodaInvii.Tipo.GUASTO || it.tipo == CodaInvii.Tipo.FOTO_GUASTO }.map { it.idLocale }.distinct().size
        if (guasti > 0) out += quanti(guasti, "guasto", "guasti")
        val prestiti = ops.count { it.tipo == CodaInvii.Tipo.PRESTITO }
        if (prestiti > 0) out += quanti(prestiti, "prestito", "prestiti")
        val rientri = ops.count { it.tipo == CodaInvii.Tipo.RESTITUISCI }
        if (rientri > 0) out += quanti(rientri, "restituzione", "restituzioni")
        val firme = ops.count { it.tipo == CodaInvii.Tipo.FIRMA_DPI }
        if (firme > 0) out += quanti(firme, "firma", "firme")
        return out
    }
}

// ---------------------------------------------------------------------------------- statistiche delle ore (§14.11)

/** Una riga delle statistiche: una persona o una commessa ("" = attività dello studio). */
data class RigaStatisticaOre(
    val chiave: String,
    val nome: String,
    val ore: Double = 0.0,
    val fatturabili: Double = 0.0,
    /** fatturabili / ore x 100, intera; null senza ore. */
    val percentuale: Int? = null,
    val oreRapportini: Double = 0.0,
    val oreRegistrate: Double = 0.0,
    /** Solo con il permesso dei soldi. */
    val costo: Double? = null,
    /** Falso se manca il costo orario di qualcosa: il costo è più basso del vero. */
    val costoNoto: Boolean = true,
    val idCliente: String = "",
    val cliente: String = "",
) {
    /** La parte fatturabile, da 0 a 1, per la barra. */
    val quotaFatturabile: Float get() = if (ore > 0) (fatturabili / ore).toFloat().coerceIn(0f, 1f) else 0f

    companion object {
        fun daJson(o: JSONObject) = RigaStatisticaOre(
            chiave = o.testo("chiave"), nome = o.testo("nome"), ore = o.numero("ore") ?: 0.0, fatturabili = o.numero("fatturabili") ?: 0.0,
            percentuale = o.numero("percentuale")?.toInt(), oreRapportini = o.numero("oreRapportini") ?: 0.0,
            oreRegistrate = o.numero("oreRegistrate") ?: 0.0, costo = o.numero("costo"),
            costoNoto = o.booleanoONull("costoNoto") ?: true, idCliente = o.testo("idCliente"), cliente = o.testo("cliente"),
        )

        /** La percentuale come la fa il server: intera, null senza ore. */
        fun percentuale(fatturabili: Double, ore: Double): Int? = if (ore > 0) Math.round(fatturabili / ore * 100).toInt() else null
    }
}

/** statisticheOre {da, a, per}: "persona" o "commessa", righe dalla più grande, e il totale. */
data class StatisticheOre(val per: String, val righe: List<RigaStatisticaOre> = emptyList(), val totale: RigaStatisticaOre? = null) {
    /** Le ore della riga più grande: le barre si misurano su questa. */
    val massimo: Double get() = righe.maxOfOrNull { it.ore } ?: 0.0

    companion object {
        fun daJson(o: JSONObject) = StatisticheOre(
            o.testo("per"), o.optJSONArray("righe").oggetti().map(RigaStatisticaOre::daJson),
            o.optJSONObject("totale")?.let { RigaStatisticaOre.daJson(it.put("chiave", "").put("nome", "Totale")) },
        )
    }
}
