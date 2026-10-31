package eu.stgm.wisper.rapportino

import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit

/*
 * Fase 6, mezzi e attrezzature (fase6.md §7, architettura.md §17.10-§17.13): il mezzo
 * con km, scadenze e guasti; il catalogo di strumenti, attrezzature e DPI con la
 * taratura; assegnazioni e prestiti; lo strumento usato nel rapportino.
 */

/** I conti dei mezzi portati da server/src/conti.js, coi casi di server/prove/casi-mezzi.json. */
object ContiMezzi {
    private val IT = DateTimeFormatter.ofPattern("dd/MM/yyyy")

    /** Lo stato della taratura con la parola (§7.5). */
    data class StatoTaratura(val stato: String, val parola: String, val giorni: Int?, val scade: String) {
        /** Non si sceglie nel rapportino: non conforme, o al laboratorio (§3.8). */
        val spento: Boolean get() = stato == NON_CONFORME || stato == LABORATORIO
        val scaduta: Boolean get() = stato == SCADUTA

        /** Il colore della parola: rosso, ambra, blu, verde o grigio. */
        val colore: String
            get() = when (stato) {
                SCADUTA, NON_CONFORME -> ColoreFase5.ROSSO
                IN_SCADENZA -> ColoreFase5.AMBRA
                LABORATORIO -> ColoreFase5.BLU
                VALIDA -> ColoreFase5.VERDE
                else -> ColoreFase5.GRIGIO
            }

        fun aJson(): JSONObject = JSONObject().put("stato", stato).put("parola", parola).put("giorni", giorni ?: JSONObject.NULL).put("scade", scade)

        companion object {
            fun daJson(o: JSONObject?): StatoTaratura? = o?.let {
                if (it.testo("stato").isBlank()) null
                else StatoTaratura(it.testo("stato"), it.testo("parola"), it.numero("giorni")?.toInt(), it.testo("scade"))
            }
        }
    }

    const val VALIDA = "valida"
    const val IN_SCADENZA = "in_scadenza"
    const val SCADUTA = "scaduta"
    const val LABORATORIO = "laboratorio"
    const val NON_CONFORME = "non_conforme"
    const val SENZA = "senza"

    /** L'ultima taratura (o verifica): data, scade, esito. */
    data class Ultima(val data: String, val scade: String, val esito: String) {
        companion object {
            fun daJson(o: JSONObject?): Ultima? = o?.let { Ultima(it.testo("data"), it.testo("scade"), it.testo("esito")) }
        }
    }

    /**
     * Come statoTaratura() del server: [controllo] "taratura" | "verifica" | "" (null
     * senza controllo). Il giorno "scade" vale ancora; dal giorno dopo è scaduta.
     */
    fun statoTaratura(controllo: String, ultima: Ultima?, fuoriUso: String, inLaboratorio: Boolean, oggi: LocalDate, preavviso: Int): StatoTaratura? {
        val c = controllo.trim()
        if (c.isBlank()) return null
        val dpi = c == "verifica"
        val t = if (dpi) "Verifica" else "Taratura"
        val scade = ultima?.scade.orEmpty()
        if (fuoriUso == NON_CONFORME || ultima?.esito == NON_CONFORME) return StatoTaratura(NON_CONFORME, "Non conforme", null, scade)
        if (inLaboratorio) return StatoTaratura(LABORATORIO, if (dpi) "In verifica" else "In taratura", null, scade)
        if (ultima == null) return StatoTaratura(SENZA, "$t non scritta", null, "")
        val dataScade = dataDi(scade) ?: return StatoTaratura(VALIDA, if (dpi) "Verificato" else "Tarato", null, "")
        val g = ChronoUnit.DAYS.between(oggi, dataScade).toInt()
        if (g < 0) return StatoTaratura(SCADUTA, "$t scaduta da " + (if (-g == 1) "1 giorno" else "${-g} giorni"), -g, scade)
        if (g <= preavviso) return StatoTaratura(IN_SCADENZA, if (g == 0) "$t scade oggi" else "$t fra " + (if (g == 1) "1 giorno" else "$g giorni"), g, scade)
        return StatoTaratura(VALIDA, (if (dpi) "Verificato" else "Tarato") + " fino al " + dataScade.format(IT), g, scade)
    }

    /** La prossima revisione: senza revisioni fine mese dell'immatricolazione + 4 anni, poi fine mese della revisione + 24 mesi. */
    fun scadenzaRevisione(immatricolazione: String, ultimaRevisione: String): String {
        val base = dataDi(ultimaRevisione)?.plusMonths(24) ?: dataDi(immatricolazione)?.plusMonths(48) ?: return ""
        return base.withDayOfMonth(base.lengthOfMonth()).toString()
    }

    /** Quanti km mancano al tagliando (negativo: passato), o null se non è a km o mancano i km. */
    fun kmAlTagliando(tagliandoKm: Double?, tagliandoUltimoKm: Double?, km: Double?): Long? {
        if (tagliandoKm == null || tagliandoKm <= 0 || km == null) return null
        return Math.round((tagliandoUltimoKm ?: 0.0) + tagliandoKm - km)
    }

    /** "84.320". */
    fun km(n: Number?): String = n?.let { "%,d".format(java.util.Locale.ITALY, it.toLong()) }.orEmpty()
}

// ---------------------------------------------------------------------------------- quello che serve senza rete (anagrafiche)

/** Un mezzo nelle anagrafiche (per il telefono senza rete): [mio] = ce l'ho io. */
data class MezzoBreve(val id: String, val titolo: String, val proprieta: String, val stato: String, val statoVisto: String, val fermo: Boolean, val mio: Boolean) {
    fun aJson(): JSONObject = JSONObject().put("id", PonteServer.idJson(id)).put("titolo", titolo).put("proprieta", proprieta).put("stato", stato)
        .put("statoVisto", statoVisto).put("fermo", fermo).put("mio", mio)

    companion object {
        fun daJson(o: JSONObject) = MezzoBreve(o.testo("id"), o.testo("titolo"), o.testo("proprieta"), o.testo("stato"), o.testo("statoVisto"), o.vero("fermo"), o.vero("mio"))
    }
}

/**
 * Uno strumento mio nelle anagrafiche: lo stato della taratura il telefono lo rifà
 * dalla data anche senza rete (uno che scade stanotte domattina è scaduto, §3.13).
 */
data class StrumentoMio(
    val id: String, val codice: String, val nome: String, val categoria: String, val matricola: String, val controllo: String,
    val fuoriUso: String, val ultima: ContiMezzi.Ultima?, val taratura: ContiMezzi.StatoTaratura?,
) {
    /** Lo stato di oggi: al laboratorio e non conforme come dice il server, il resto rifatto dalla data. */
    fun statoOggi(oggi: LocalDate = LocalDate.now(), preavviso: Int = 30): ContiMezzi.StatoTaratura? {
        if (taratura?.stato == ContiMezzi.LABORATORIO || taratura?.stato == ContiMezzi.NON_CONFORME) return taratura
        return ContiMezzi.statoTaratura(controllo, ultima, fuoriUso, false, oggi, preavviso) ?: taratura
    }

    fun aJson(): JSONObject = JSONObject().put("id", PonteServer.idJson(id)).put("codice", codice).put("nome", nome).put("categoria", categoria)
        .put("matricola", matricola).put("controllo", controllo).put("fuoriUso", fuoriUso)
        .put("ultimaTaratura", ultima?.let { JSONObject().put("data", it.data).put("scade", it.scade).put("esito", it.esito) } ?: JSONObject.NULL)
        .put("taratura", taratura?.aJson() ?: JSONObject.NULL)

    companion object {
        fun daJson(o: JSONObject) = StrumentoMio(
            o.testo("id"), o.testo("codice"), o.testo("nome"), o.testo("categoria"), o.testo("matricola"), o.testo("controllo"), o.testo("fuoriUso"),
            ContiMezzi.Ultima.daJson(o.optJSONObject("ultimaTaratura")), ContiMezzi.StatoTaratura.daJson(o.optJSONObject("taratura")),
        )
    }
}

// ---------------------------------------------------------------------------------- mezzi

/** Chi ce l'ha (l'assegnazione in corso, o "sua" per l'auto di una persona). */
data class Chi(val idAssegnazione: String = "", val tipo: String = "", val idPersona: String = "", val idCommessa: String = "", val idSoggetto: String = "", val nome: String = "", val dal: String = "", val rientro: String = "") {
    companion object {
        fun daJson(o: JSONObject?): Chi? = o?.let {
            Chi(it.testo("idAssegnazione"), it.testo("tipo"), it.testo("idPersona"), it.testo("idCommessa"), it.testo("idSoggetto"), it.testo("nome"), it.testo("dal"), it.testo("rientro"))
        }
    }
}

data class LetturaKm(val id: String, val idLocale: String, val data: String, val km: Long, val origine: String, val utente: String, val conFoto: Boolean) {
    companion object {
        fun daJson(o: JSONObject) = LetturaKm(o.testo("id"), o.testo("idLocale"), o.testo("data"), (o.numero("km") ?: 0.0).toLong(), o.testo("origine"), o.testo("utente"), o.optJSONObject("foto") != null)
    }
}

/** Un guasto o una manutenzione (§7.3): il costo non si scrive qui (è la spesa o la ricevuta). */
data class Manutenzione(
    val id: String, val idLocale: String = "", val idVeicolo: String = "", val idAttrezzatura: String = "", val oggetto: String = "",
    val tipo: String = "guasto", val stato: String = "aperta", val statoVisto: String = "Segnalato", val fermo: Boolean = false,
    val data: String = "", val km: Long? = null, val titolo: String, val descrizione: String = "", val esito: String = "",
    val segnalataDa: String = "", val segnalataDaNome: String = "", val foto: List<FileRemoto> = emptyList(), val inCoda: Boolean = false,
    val fotoInAttesa: List<java.io.File> = emptyList(),
) {
    val aperta: Boolean get() = stato != "chiusa"

    companion object {
        fun daJson(o: JSONObject) = Manutenzione(
            o.testo("id"), o.testo("idLocale"), o.testo("idVeicolo"), o.testo("idAttrezzatura"), o.testo("oggetto"), o.testo("tipo"), o.testo("stato"),
            o.testo("statoVisto"), o.vero("fermo"), o.testo("data"), o.numero("km")?.toLong(), o.testo("titolo"), o.testo("descrizione"), o.testo("esito"),
            o.testo("segnalataDa"), o.testo("segnalataDaNome"), o.optJSONArray("foto").oggetti().map(FileRemoto::daJson),
        )
    }
}

/** Un'assegnazione o un prestito (§7.7). */
data class Assegnazione(
    val id: String, val idVeicolo: String = "", val idAttrezzatura: String = "", val oggetto: String = "", val tipo: String = "", val tipoVisto: String = "",
    val idPersona: String = "", val idSoggetto: String = "", val chi: String = "", val dal: String = "", val rientro: String = "", val al: String = "",
    val inCorso: Boolean = false, val inRitardo: Boolean = false,
) {
    companion object {
        fun daJson(o: JSONObject) = Assegnazione(
            o.testo("id"), o.testo("idVeicolo"), o.testo("idAttrezzatura"), o.testo("oggetto"), o.testo("tipo"), o.testo("tipoVisto"),
            o.testo("idPersona"), o.testo("idSoggetto"), o.testo("chi"), o.testo("dal"), o.testo("rientro"), o.testo("al"), o.vero("inCorso"), o.vero("inRitardo"),
        )
    }
}

data class ProssimaScadenza(val id: String, val tipo: String, val data: String, val statoVisto: String) {
    companion object {
        fun daJson(o: JSONObject?): ProssimaScadenza? = o?.let { ProssimaScadenza(it.testo("id"), it.testo("tipo"), it.testo("data"), it.testo("statoVisto")) }
    }
}

data class VoceCosto(val nome: String, val importo: Double, val quante: Int)

/** I costi dell'anno di un mezzo (§7.4): solo con `costi`. */
data class CostiMezzo(val anno: Int, val kmAnno: Long, val voci: List<VoceCosto>, val totale: Double, val euroKm: Double?) {
    companion object {
        fun daJson(o: JSONObject?): CostiMezzo? = o?.let {
            CostiMezzo(it.optInt("anno"), (it.optJSONObject("km")?.numero("anno") ?: 0.0).toLong(),
                it.optJSONArray("voci").oggetti().map { v -> VoceCosto(v.testo("nome"), v.numero("importo") ?: 0.0, v.optInt("quante")) },
                it.numero("totale") ?: 0.0, it.numero("euroKm"))
        }
    }
}

/** Un mezzo (`mezzi` e `mezzo {id}`, §17.10). */
data class Mezzo(
    val id: String, val nome: String, val targa: String = "", val titolo: String, val tipo: String = "auto", val proprieta: String = "persona",
    val proprietaVista: String = "", val statoVisto: String = "", val stato: String = "", val motivoFermo: String = "", val chi: Chi? = null,
    val km: Long? = null, val kmIl: String = "", val kmAlTagliando: Long? = null, val prossimaScadenza: ProssimaScadenza? = null,
    val guastiAperti: Int = 0, val fermo: Boolean = false, val mio: Boolean = false, val euroKm: Double? = null,
    // ---- la scheda
    val immatricolazione: String = "", val alimentazione: String = "", val note: String = "",
    val scadenze: List<Scadenza> = emptyList(), val letture: List<LetturaKm> = emptyList(), val manutenzioni: List<Manutenzione> = emptyList(),
    val assegnazioni: List<Assegnazione> = emptyList(), val documenti: List<DocArchivio> = emptyList(), val costi: CostiMezzo? = null,
    val puoScrivere: Boolean = false, val puoSegnareKm: Boolean = false, val puoPrendere: Boolean = false, val lettoAl: String = "",
) {
    val delloStudio: Boolean get() = proprieta == "studio"

    /** Il colore della parola di stato: Fermo rosso, In officina ambra, Assegnato e In prestito blu, Disponibile verde. */
    val coloreStato: String
        get() = when (stato) {
            "fermo" -> ColoreFase5.ROSSO
            "officina" -> ColoreFase5.AMBRA
            "assegnato", "prestito" -> ColoreFase5.BLU
            "disponibile" -> ColoreFase5.VERDE
            else -> ColoreFase5.GRIGIO
        }

    companion object {
        fun daJson(o: JSONObject) = Mezzo(
            id = o.testo("id"), nome = o.testo("nome"), targa = o.testo("targa"), titolo = o.testo("titolo").ifBlank { (o.testo("nome") + " " + o.testo("targa")).trim() },
            tipo = o.testo("tipo"), proprieta = o.testo("proprieta"), proprietaVista = o.testo("proprietaVista"), statoVisto = o.testo("statoVisto"),
            stato = o.testo("stato"), motivoFermo = o.testo("motivoFermo"), chi = Chi.daJson(o.optJSONObject("chi")), km = o.numero("km")?.toLong(),
            kmIl = o.testo("kmIl"), kmAlTagliando = o.numero("kmAlTagliando")?.toLong(), prossimaScadenza = ProssimaScadenza.daJson(o.optJSONObject("prossimaScadenza")),
            guastiAperti = o.optInt("guastiAperti"), fermo = o.vero("fermo"), mio = o.vero("mio"), euroKm = o.numero("euroKm"),
            immatricolazione = o.testo("immatricolazione"), alimentazione = o.testo("alimentazione"), note = o.testo("note"),
            scadenze = o.optJSONArray("scadenze").oggetti().map(Scadenza::daJson), letture = o.optJSONArray("letture").oggetti().map(LetturaKm::daJson),
            manutenzioni = o.optJSONArray("manutenzioni").oggetti().map(Manutenzione::daJson), assegnazioni = o.optJSONArray("assegnazioni").oggetti().map(Assegnazione::daJson),
            documenti = o.optJSONArray("documenti").oggetti().map(DocArchivio::daJson), costi = CostiMezzo.daJson(o.optJSONObject("costi")),
            puoScrivere = o.vero("puoScrivere"), puoSegnareKm = o.vero("puoSegnareKm"), puoPrendere = o.vero("puoPrendere"), lettoAl = o.testo("_lettoAl"),
        )
    }
}

// ---------------------------------------------------------------------------------- attrezzature e strumenti

data class TaraturaFatta(val id: String, val data: String, val scade: String, val esito: String, val esitoVisto: String, val laboratorio: String, val certificato: String, val frase: String, val idDocumento: String) {
    companion object {
        fun daJson(o: JSONObject) = TaraturaFatta(o.testo("id"), o.testo("data"), o.testo("scade"), o.testo("esito"), o.testo("esitoVisto"), o.testo("laboratorio"), o.testo("certificato"), o.testo("frase"), o.testo("idDocumento"))
    }
}

/** Un uso di uno strumento in un intervento (§7.8), con lo stato della taratura di quel giorno. */
data class UsoStrumento(val data: String, val idRapportino: String, val ticket: String, val cliente: String, val impianto: String, val chi: String, val statoAllora: String, val scadeAllora: String, val confermato: Boolean) {
    companion object {
        fun daJson(o: JSONObject) = UsoStrumento(o.testo("data"), o.testo("idRapportino"), o.testo("ticket"), o.testo("cliente"), o.testo("impianto"), o.testo("chi"), o.testo("statoAllora"), o.testo("scadeAllora"), o.vero("confermato"))
    }
}

/** Uno strumento, un'attrezzatura o un DPI del catalogo (§7.5, §17.11). */
data class Attrezzatura(
    val id: String, val codice: String, val nome: String, val categoria: String = "", val categoriaNome: String = "", val marca: String = "", val modello: String = "",
    val matricola: String = "", val statoVisto: String = "", val stato: String = "", val motivo: String = "", val chi: Chi? = null, val rientro: String = "",
    val posizione: String = "", val controllo: String = "", val taratura: ContiMezzi.StatoTaratura? = null, val mio: Boolean = false, val dismesso: Boolean = false,
    // ---- la scheda
    val controlloOgniMesi: Int? = null, val laboratorio: String = "", val idLaboratorio: String = "", val fuoriUso: String = "",
    val tarature: List<TaraturaFatta> = emptyList(), val assegnazioni: List<Assegnazione> = emptyList(), val manutenzioni: List<Manutenzione> = emptyList(),
    val documenti: List<DocArchivio> = emptyList(), val usi: List<UsoStrumento> = emptyList(), val usiDaControllare: List<UsoStrumento> = emptyList(),
    val fraseUsi: String = "", val puoScrivere: Boolean = false, val puoPrendere: Boolean = false, val lettoAl: String = "",
) {
    val strumento: Boolean get() = categoria == "strumento"
    val disponibile: Boolean get() = stato == "disponibile"

    /** Il colore dello stato visto (uno solo, §7.5). */
    val coloreStato: String
        get() = when (stato) {
            "fuori", "fuori_uso", "scaduta" -> ColoreFase5.ROSSO
            "laboratorio", "riparazione", "prestito", "assegnato" -> ColoreFase5.BLU
            "disponibile" -> ColoreFase5.VERDE
            else -> if (statoVisto.startsWith("Fuori uso") || statoVisto.startsWith("Taratura scaduta")) ColoreFase5.ROSSO else ColoreFase5.GRIGIO
        }

    companion object {
        fun daJson(o: JSONObject) = Attrezzatura(
            id = o.testo("id"), codice = o.testo("codice"), nome = o.testo("nome"), categoria = o.testo("categoria"), categoriaNome = o.testo("categoriaNome"),
            marca = o.testo("marca"), modello = o.testo("modello"), matricola = o.testo("matricola"), statoVisto = o.testo("statoVisto"), stato = o.testo("stato"),
            motivo = o.testo("motivo"), chi = Chi.daJson(o.optJSONObject("chi")), rientro = o.testo("rientro"), posizione = o.testo("posizione"),
            controllo = o.testo("controllo"), taratura = ContiMezzi.StatoTaratura.daJson(o.optJSONObject("taratura")), mio = o.vero("mio"), dismesso = o.vero("dismesso"),
            controlloOgniMesi = o.numero("controlloOgniMesi")?.toInt(), laboratorio = o.testo("laboratorio"), idLaboratorio = o.testo("idLaboratorio"),
            fuoriUso = o.testo("fuoriUso"), tarature = o.optJSONArray("tarature").oggetti().map(TaraturaFatta::daJson),
            assegnazioni = o.optJSONArray("assegnazioni").oggetti().map(Assegnazione::daJson), manutenzioni = o.optJSONArray("manutenzioni").oggetti().map(Manutenzione::daJson),
            documenti = o.optJSONArray("documenti").oggetti().map(DocArchivio::daJson), usi = o.optJSONArray("usi").oggetti().map(UsoStrumento::daJson),
            usiDaControllare = o.optJSONArray("usiDaControllare").oggetti().map(UsoStrumento::daJson), fraseUsi = o.testo("fraseUsi"),
            puoScrivere = o.vero("puoScrivere"), puoPrendere = o.vero("puoPrendere"), lettoAl = o.testo("_lettoAl"),
        )
    }
}

// ---------------------------------------------------------------------------------- lo strumento nel rapportino (§3.9, §7.8)

/**
 * Uno strumento usato in un rapportino, con lo stato della taratura del giorno del
 * rapportino (congelato dal server). [confermato]: usato con la taratura scaduta
 * confermando ("Lo uso lo stesso"): la conferma resta scritta.
 */
data class StrumentoUsato(
    val idAttrezzatura: String,
    val codice: String = "",
    val nome: String = "",
    val matricola: String = "",
    val scadeAllora: String = "",
    val statoAllora: String = "",
    val confermato: Boolean = false,
    val verifica: Boolean = false,
) {
    fun perServer(): JSONObject = JSONObject().put("idAttrezzatura", PonteServer.idJson(idAttrezzatura)).apply { if (confermato) put("confermato", true) }

    fun aJson(): JSONObject = JSONObject().put("idAttrezzatura", PonteServer.idJson(idAttrezzatura)).put("codice", codice).put("nome", nome)
        .put("matricola", matricola).put("scadeAllora", scadeAllora).put("statoAllora", statoAllora).put("confermato", confermato).put("verifica", verifica)

    /** "Multimetro 87V (taratura scaduta, confermato)" per il riepilogo. */
    val riga: String
        get() = nome + when (statoAllora) {
            ContiMezzi.SCADUTA -> " (" + (if (verifica) "verifica" else "taratura") + " scaduta" + (if (confermato) ", confermato" else "") + ")"
            ContiMezzi.NON_CONFORME -> " (non conforme)"
            ContiMezzi.LABORATORIO -> " (al laboratorio)"
            ContiMezzi.SENZA -> " (" + (if (verifica) "verifica" else "taratura") + " non scritta)"
            ContiMezzi.VALIDA, ContiMezzi.IN_SCADENZA -> " (" + (if (verifica) "verificato" else "tarato") + ")"
            else -> ""
        }

    companion object {
        fun daJson(o: JSONObject) = StrumentoUsato(
            o.testo("idAttrezzatura"), o.testo("codice"), o.testo("nome"), o.testo("matricola"), o.testo("scadeAllora"), o.testo("statoAllora"), o.vero("confermato"), o.vero("verifica"),
        )

        fun lista(a: JSONArray?): List<StrumentoUsato> = a.oggetti().map(::daJson).filter { it.idAttrezzatura.isNotBlank() }

        /**
         * Cosa succede toccando uno strumento nel passo 3 (§3.8): si sceglie, si chiede
         * conferma (scaduto con l'avviso), o si dice il motivo (non conforme, al
         * laboratorio, scaduto col blocco). Mai un pulsante spento senza motivo.
         */
        fun sceltaDi(stato: ContiMezzi.StatoTaratura?, taraturaBlocco: String): Scelta = when {
            stato == null -> Scelta.SI
            stato.stato == ContiMezzi.NON_CONFORME -> Scelta.NO_NON_CONFORME
            stato.stato == ContiMezzi.LABORATORIO -> Scelta.NO_LABORATORIO
            stato.stato == ContiMezzi.SCADUTA && taraturaBlocco == "blocco" -> Scelta.NO_BLOCCO
            stato.stato == ContiMezzi.SCADUTA -> Scelta.CONFERMA
            else -> Scelta.SI
        }
    }

    enum class Scelta { SI, CONFERMA, NO_NON_CONFORME, NO_LABORATORIO, NO_BLOCCO }
}
