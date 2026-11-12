package eu.stgm.wisper.rapportino

import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate

/*
 * I preventivi della fase 2 (docs/gestionale/fase2.md §3, architettura.md §13):
 * il listino, il preventivo con le sue sezioni e voci, le scadenze di pagamento,
 * e i conti. I conti veri li fa il server: qui c'e' l'anteprima che il telefono
 * mostra mentre si compila, con le stesse regole e gli stessi casi di prova
 * (server/prove/casi-preventivo.json).
 */

/** Come si conta una voce: a corpo (una cifra), a ore, a quantita' (pezzi, metri). */
object ModoVoce {
    const val CORPO = "corpo"
    const val ORE = "ore"
    const val QUANTITA = "quantita"

    val ELENCO = listOf(CORPO, ORE, QUANTITA)

    fun da(testo: String?): String = when (testo?.trim()?.lowercase()) {
        ORE, "a ore", "ora" -> ORE
        QUANTITA, "quantità", "a quantita", "a quantità" -> QUANTITA
        else -> CORPO
    }

    /** "a corpo", "a ore", "a quantità". */
    fun nome(modo: String): String = when (modo) {
        ORE -> "a ore"
        QUANTITA -> "a quantità"
        else -> "a corpo"
    }
}

/** Gli stati salvati di un preventivo, piu' SCADUTO, che si calcola (un inviato con la scadenza passata). */
object StatoPreventivo {
    const val BOZZA = "BOZZA"
    const val INVIATO = "INVIATO"
    const val ACCETTATO = "ACCETTATO"
    const val RIFIUTATO = "RIFIUTATO"
    const val SOSTITUITO = "SOSTITUITO"
    const val SCADUTO = "SCADUTO"

    /** La parola che si legge: Bozza, Inviato, Accettato, Scaduto, Rifiutato, Sostituito. */
    fun parola(stato: String): String = when (stato.uppercase()) {
        INVIATO -> "Inviato"
        ACCETTATO -> "Accettato"
        RIFIUTATO -> "Rifiutato"
        SOSTITUITO -> "Sostituito"
        SCADUTO -> "Scaduto"
        else -> "Bozza"
    }
}

/**
 * Un servizio (fino alla 1.3 "una prestazione del listino"): si prende con un tocco in un preventivo e, dalla 1.4.0, in
 * un'indennità del rapportino. I campi sono quelli di Flextaxa (servizi.md §1): [nome] è la Descrizione, [codice] il
 * Codice articolo; [modo] non si vede, lo decide l'unità ([Servizi.modoDaUnita]).
 */
data class VoceListino(
    val id: String,
    val nome: String,
    val codice: String = "",
    val descrizione: String = "",
    val modo: String = ModoVoce.CORPO,
    val unita: String = "",
    /** Prezzo di vendita unitario, IVA esclusa. Null = senza prezzo (i servizi di prima), o senza il permesso dei soldi. */
    val prezzo: Double? = null,
    val attivo: Boolean = true,
    val ordine: Int = 0,
    // ---- dalla 1.4.0 (servizi.md §1)
    /** "servizio" o "prodotto". */
    val tipo: String = Servizi.SERVIZIO,
    val aliquotaIva: Double = 22.0,
    /** Costo di acquisto unitario, IVA esclusa; null = non scritto (o senza il permesso dei soldi). */
    val prezzoAcquisto: Double? = null,
    val aliquotaAcquisto: Double = 22.0,
    val fornitore: String = "",
    val tag: List<String> = emptyList(),
    /** Note personali: non vanno mai nei documenti. */
    val note: String = "",
    val immagine: FileRemoto? = null,
) {
    fun aJson(): JSONObject = JSONObject().put("id", PonteServer.idJson(id).takeIf { id.isNotBlank() } ?: JSONObject.NULL)
        .put("codice", codice).put("nome", nome).put("descrizione", descrizione).put("modo", modo).put("unita", unita)
        .put("prezzo", prezzo ?: JSONObject.NULL).put("attivo", attivo).put("ordine", ordine)
        .put("tipo", tipo).put("aliquotaIva", aliquotaIva).put("prezzoAcquisto", prezzoAcquisto ?: JSONObject.NULL)
        .put("aliquotaAcquisto", aliquotaAcquisto).put("fornitore", fornitore).put("tag", JSONArray(tag)).put("note", note)
        .put("immagine", immagine?.aJson() ?: JSONObject.NULL)

    /** "45,00 €/h", "350,00 €", "0,76 €/km"; null senza prezzo. */
    fun prezzoPerUnita(): String? = prezzo?.let { p -> Numeri.euro(p) + perUnita(unita) }

    companion object {
        /**
         * 1.4.0: come si scrive l'unità dopo il prezzo. Le unità di Flextaxa (Nr, Ore, Pz, Km, Giorni, A corpo) dicono
         * "45,00 €/h", "30,00 €/giorno", "0,76 €/km", "12,00 €/pz"; Nr e A corpo niente (il prezzo è per uno).
         */
        fun perUnita(unita: String): String = when (unita.trim().lowercase()) {
            "", "nr", "a corpo" -> ""
            "ore", "ora", "h" -> "/h"
            "giorni", "giorno" -> "/giorno"
            "km" -> "/km"
            "pz" -> "/pz"
            else -> "/" + unita.trim()
        }

        fun daJson(o: JSONObject) = VoceListino(
            id = o.testo("id"),
            nome = o.testo("nome"),
            codice = o.testo("codice"),
            descrizione = o.testo("descrizione"),
            modo = ModoVoce.da(o.testo("modo")),
            unita = o.testo("unita"),
            prezzo = o.numero("prezzo"),
            attivo = if (o.has("attivo")) o.vero("attivo") else true,
            ordine = o.optInt("ordine", 0),
            tipo = if (o.testo("tipo").equals(Servizi.PRODOTTO, ignoreCase = true)) Servizi.PRODOTTO else Servizi.SERVIZIO,
            aliquotaIva = o.numero("aliquotaIva") ?: 22.0,
            prezzoAcquisto = o.numero("prezzoAcquisto"),
            aliquotaAcquisto = o.numero("aliquotaAcquisto") ?: 22.0,
            fornitore = o.testo("fornitore"),
            tag = Servizi.tagDaJson(o),
            note = o.testo("note"),
            immagine = Indennita.immagineDa(o),
        )
    }
}

/**
 * Una voce del preventivo. [alternativa] e' un testo: le voci con lo stesso testo
 * sono "una di queste", e conta solo quella [scelta]. Una [facoltativa] conta solo
 * se [scelta].
 */
data class VocePreventivo(
    val id: String = "",
    val descrizione: String,
    val modo: String = ModoVoce.CORPO,
    val quantita: Double = 1.0,
    val unita: String = "",
    /** Null senza il permesso dei soldi (il server lo toglie) o se non ancora scritto. */
    val prezzo: Double? = null,
    val scontoPercentuale: Double = 0.0,
    val facoltativa: Boolean = false,
    val alternativa: String = "",
    val scelta: Boolean = false,
    val idListino: String = "",
    val ordine: Int = 0,
    /** L'importo come l'ha calcolato il server, se l'ha mandato. */
    val importoServer: Double? = null,
    /** Se entra nei conti, come l'ha deciso il server (§13.4 `conta`); null = si decide qui. */
    val contaServer: Boolean? = null,
) {
    val inAlternativa: Boolean get() = alternativa.isNotBlank()

    /** Il gruppo delle alternative: lo stesso testo, senza badare a maiuscole e spazi (gruppoAlternativa di conti.js). */
    val gruppo: String get() = alternativa.trim().lowercase().replace(Regex("""\s+"""), " ")

    /** "16 ore × 45,00 €", "a corpo", "3 pz × 12,00 €". */
    fun dettaglio(conPrezzo: Boolean): String {
        val p = prezzo
        val base = when (modo) {
            ModoVoce.ORE -> Numeri.scrivi(quantita) + (if (quantita == 1.0) " ora" else " ore")
            ModoVoce.QUANTITA -> Numeri.scrivi(quantita) + " " + unita.ifBlank { "pz" }
            else -> if (quantita == 1.0) "a corpo" else Numeri.scrivi(quantita) + " a corpo"
        }
        val conIlPrezzo = if (conPrezzo && p != null && (modo != ModoVoce.CORPO || quantita != 1.0)) "$base × ${Numeri.euro(p)}" else base
        return if (scontoPercentuale > 0) "$conIlPrezzo · sconto ${Numeri.scrivi(scontoPercentuale)}%" else conIlPrezzo
    }

    companion object {
        fun daJson(o: JSONObject) = VocePreventivo(
            id = o.testo("id"),
            descrizione = o.testo("descrizione"),
            modo = ModoVoce.da(o.testo("modo")),
            quantita = o.numero("quantita") ?: 1.0,
            unita = o.testo("unita"),
            prezzo = o.numero("prezzo"),
            scontoPercentuale = o.primoNumero("scontoPercentuale", "sconto_percentuale", "sconto") ?: 0.0,
            facoltativa = o.vero("facoltativa"),
            alternativa = o.testo("alternativa"),
            scelta = o.vero("scelta"),
            idListino = o.primoTesto("idListino", "listinoId", "listino_id"),
            ordine = o.optInt("ordine", 0),
            importoServer = o.numero("importo"),
            contaServer = o.booleanoONull("conta"),
        )
    }
}

/** Una sezione del preventivo (Progettazione, Cantiere) con le sue voci, nell'ordine. */
data class SezionePreventivo(
    val id: String = "",
    val titolo: String,
    val voci: List<VocePreventivo> = emptyList(),
    val ordine: Int = 0,
    /** Il subtotale come l'ha calcolato il server (§13.4), se l'ha mandato. */
    val subtotaleServer: Double? = null,
)

/**
 * Una scadenza di pagamento: "30% alla firma", "Saldo a fine lavori". [tipo]
 * "percentuale" o "importo"; [quando] "firma", "avanzamento", "fine" o "data".
 */
data class ScadenzaPagamento(
    val id: String = "",
    val descrizione: String,
    val tipo: String = PERCENTUALE,
    val valore: Double = 0.0,
    val quando: String = FIRMA,
    val data: LocalDate? = null,
    /** Calcolato dal server sull'imponibile. */
    val importo: Double? = null,
) {
    companion object {
        const val PERCENTUALE = "percentuale"
        const val IMPORTO = "importo"
        const val FIRMA = "firma"
        const val AVANZAMENTO = "avanzamento"
        const val FINE = "fine"
        const val DATA = "data"

        fun nomeQuando(q: String): String = when (q) {
            FIRMA -> "alla firma"
            AVANZAMENTO -> "ad avanzamento"
            FINE -> "a fine lavori"
            DATA -> "a una data"
            else -> q
        }

        fun daJson(o: JSONObject) = ScadenzaPagamento(
            id = o.testo("id"),
            descrizione = o.testo("descrizione"),
            tipo = o.testo("tipo").ifBlank { PERCENTUALE },
            valore = o.numero("valore") ?: 0.0,
            quando = o.testo("quando").ifBlank { FIRMA },
            data = o.data("data"),
            importo = o.numero("importo"),
        )
    }
}

/** Un'altra revisione dello stesso numero, da consultare. */
data class RevisionePreventivo(
    val id: String,
    val revisione: Int,
    val stato: String,
    val data: LocalDate? = null,
    val etichetta: String = "",
    val totale: Double? = null,
) {
    companion object {
        fun daJson(o: JSONObject) = RevisionePreventivo(
            id = o.testo("id"),
            revisione = o.optInt("revisione", 0),
            stato = o.testo("stato").uppercase().ifBlank { StatoPreventivo.BOZZA },
            data = o.data("data"),
            etichetta = o.testo("etichetta"),
            totale = o.numero("totale"),
        )
    }
}

/** Una cosa che la legge chiede e manca (§13.4 `mancano`): il campo e la frase pronta da mostrare. */
data class Mancanza(val campo: String, val testo: String)

/** I conti di un preventivo (fase2.md §3): ogni pezzo arrotondato al centesimo. */
data class ContoPreventivo(
    val somma: Double = 0.0,
    val scontoPercentuale: Double = 0.0,
    val scontoEuro: Double = 0.0,
    val imponibile: Double = 0.0,
    val contributo: Double = 0.0,
    val baseIva: Double = 0.0,
    val iva: Double = 0.0,
    val totale: Double = 0.0,
    val oreVoci: Double = 0.0,
    val senzaPrezzo: Int = 0,
    /** Imponibile meno le scadenze di pagamento (0 = le scadenze coprono tutto). */
    val restoScadenze: Double = 0.0,
    val subtotali: List<Double> = emptyList(),
    val importi: List<Double> = emptyList(),
    val contano: List<Boolean> = emptyList(),
    val scadenze: List<Double> = emptyList(),
) {
    companion object {
        fun daJson(o: JSONObject?): ContoPreventivo? = o?.takeIf { it.has("totale") || it.has("imponibile") }?.let {
            ContoPreventivo(
                somma = it.primoNumero("sommaVoci", "somma") ?: 0.0,
                scontoPercentuale = it.primoNumero("scontoDaPercentuale", "scontoPercentuale") ?: 0.0,
                scontoEuro = it.numero("scontoEuro") ?: 0.0,
                imponibile = it.numero("imponibile") ?: 0.0,
                contributo = it.primoNumero("contributo", "eppi", "contributoIntegrativo") ?: 0.0,
                baseIva = it.numero("baseIva") ?: 0.0,
                iva = it.numero("iva") ?: 0.0,
                totale = it.numero("totale") ?: 0.0,
                oreVoci = it.numero("oreVoci") ?: 0.0,
                senzaPrezzo = it.optInt("senzaPrezzo", 0),
                restoScadenze = it.numero("restoScadenze") ?: 0.0,
            )
        }
    }
}

/** Quello che la legge chiede in un preventivo (DL 1/2012 art. 9, L. 124/2017): una riga per cosa. */
data class RichiestaLegge(val chiave: String, val nome: String, val ok: Boolean)

/** Un preventivo con tutto: testata, sezioni e voci, scadenze di pagamento, revisioni, conti. */
data class Preventivo(
    val id: String = "",
    /** "PR/2026/012"; vuoto finche' il server non l'ha dato. */
    val numero: String = "",
    val revisione: Int = 0,
    val idCliente: String = "",
    /** Il nome del cliente come lo manda l'elenco (anche se il cliente non si vede nelle anagrafiche). */
    val nomeCliente: String = "",
    val idSede: String = "",
    val idReferente: String = "",
    val oggetto: String = "",
    val introduzione: String = "",
    /** "bassa", "media", "alta", o vuoto. */
    val complessita: String = "",
    val complessitaNota: String = "",
    val oneriPrevisti: String = "",
    val condizioni: String = "",
    val data: LocalDate? = null,
    val scadenza: LocalDate? = null,
    /** Lo stato salvato: BOZZA, INVIATO, ACCETTATO, RIFIUTATO, SOSTITUITO. */
    val stato: String = StatoPreventivo.BOZZA,
    /** Lo stato da mostrare: come [stato], ma un inviato scaduto e' SCADUTO (lo calcola il server). */
    val statoCalcolato: String = "",
    val scontoPercentuale: Double = 0.0,
    val scontoEuro: Double = 0.0,
    /** Congelati alla creazione, come le tariffe dei rapportini. Null = quelli delle impostazioni. */
    val eppiPercentuale: Double? = null,
    val ivaPercentuale: Double? = null,
    val inviatoIl: String = "",
    val accettatoIl: String = "",
    val accettatoDa: String = "",
    /** "firma", "email", "documento", "voce". */
    val accettazioneModo: String = "",
    val idFirma: String = "",
    val rifiutatoIl: String = "",
    val motivoRifiuto: String = "",
    val idCommessa: String = "",
    val modello: Boolean = false,
    val noteInterne: String = "",
    val sezioni: List<SezionePreventivo> = emptyList(),
    val scadenzePagamento: List<ScadenzaPagamento> = emptyList(),
    val revisioni: List<RevisionePreventivo> = emptyList(),
    /** I conti del server; null senza il permesso dei soldi o se non li ha mandati. */
    val contiServer: ContoPreventivo? = null,
    /** Il totale dell'elenco (senza sezioni e voci). */
    val totaleServer: Double? = null,
    /** Quello che la legge chiede e manca, come lo dice il server. Null = non l'ha detto. */
    val mancanoServer: List<Mancanza>? = null,
    /** "PR/2026/012 rev. 1", "Modello": pronta dal server. */
    val etichetta: String = "",
    /** Vero solo in BOZZA (e per i modelli): le voci si cambiano. Null = non l'ha detto. */
    val modificabile: Boolean? = null,
    /** Quante voci sono senza prezzo (il server lo dice anche senza i soldi). */
    val senzaPrezzo: Int = 0,
    /** Giorni da oggi alla scadenza, negativo se passata; null senza scadenza. */
    val giorniAllaScadenza: Int? = null,
    /** L'imponibile dell'elenco (con i soldi). */
    val imponibileServer: Double? = null,
    val creato: String = "",
    val modificato: String = "",
    /** La risposta del server cosi' com'era: va al modello del PDF (pc/ui/documenti.js). */
    val grezzo: JSONObject? = null,
) {
    val voci: List<VocePreventivo> get() = sezioni.flatMap { it.voci }

    /** Lo stato da mostrare, con SCADUTO. */
    fun statoVisto(oggi: LocalDate = LocalDate.now()): String {
        val s = statoCalcolato.ifBlank { stato }.uppercase()
        if (s == StatoPreventivo.INVIATO && scadenza != null && scadenza.isBefore(oggi)) return StatoPreventivo.SCADUTO
        return s
    }

    val bozza: Boolean get() = stato.equals(StatoPreventivo.BOZZA, ignoreCase = true)

    /** "PR/2026/012 · rev. 1". */
    val numeroCompleto: String
        get() = numero.ifBlank { "Bozza" } + if (revisione > 0) " · rev. $revisione" else ""

    /** I conti: quelli del server se ci sono, altrimenti l'anteprima con le stesse regole. */
    fun conto(ivaPredefinita: Double = 22.0, eppiPredefinito: Double = 5.0): ContoPreventivo =
        contiServer ?: ContiPreventivo.calcola(this, eppiPredefinito, ivaPredefinita)

    /** Da cambiare nell'editor: via tutto quello che ha calcolato il server, che cambiando le voci non vale più. */
    fun perModifica(): Preventivo = copy(
        contiServer = null, grezzo = null, mancanoServer = null, totaleServer = null,
        sezioni = sezioni.map { s -> s.copy(subtotaleServer = null, voci = s.voci.map { it.copy(contaServer = null, importoServer = null) }) },
    )

    /** Lo stesso preventivo con queste voci (per id) al posto di quelle che aveva: le scelte del cliente. */
    fun conVoci(nuove: List<VocePreventivo>): Preventivo {
        val perId = nuove.filter { it.id.isNotBlank() }.associateBy { it.id }
        return copy(sezioni = sezioni.map { s -> s.copy(voci = s.voci.map { perId[it.id] ?: it }, subtotaleServer = null) }, contiServer = null)
    }

    fun aJson(): JSONObject = JSONObject()
        .put("id", id).put("numero", numero).put("revisione", revisione).put("idCliente", idCliente).put("cliente", nomeCliente)
        .put("sedeId", idSede).put("referenteId", idReferente).put("oggetto", oggetto).put("introduzione", introduzione)
        .put("complessita", complessita).put("complessitaNota", complessitaNota).put("oneriPrevisti", oneriPrevisti)
        .put("condizioni", condizioni).put("data", data?.toString() ?: "").put("scadenza", scadenza?.toString() ?: "")
        .put("stato", stato).put("statoCalcolato", statoCalcolato.ifBlank { statoVisto() })
        .put("scontoPercentuale", scontoPercentuale).put("scontoEuro", scontoEuro)
        .put("eppiPercentuale", eppiPercentuale ?: JSONObject.NULL).put("ivaPercentuale", ivaPercentuale ?: JSONObject.NULL)
        .put("inviatoIl", inviatoIl).put("accettatoIl", accettatoIl).put("accettatoDa", accettatoDa)
        .put("accettazioneModo", accettazioneModo).put("rifiutatoIl", rifiutatoIl)
        .put("firma", if (idFirma.isBlank()) JSONObject.NULL else JSONObject().put("id", idFirma).put("url", "/file/$idFirma"))
        .put("motivoRifiuto", motivoRifiuto).put("idCommessa", idCommessa).put("modello", modello).put("noteInterne", noteInterne)
        .put("sezioni", JSONArray().apply {
            sezioni.forEachIndexed { i, s ->
                // Le voci dentro le loro sezioni: come le legge sezioniDi() di pc/ui/documenti.js.
                val idSez = s.id.ifBlank { "${PonteServer.NUOVO}s${i + 1}" }
                put(JSONObject().put("id", idSez).put("titolo", s.titolo).put("ordine", i + 1).put("voci", JSONArray().apply {
                    s.voci.forEachIndexed { j, v -> put(voceJson(v, j + 1).put("idSezione", idSez)) }
                }))
            }
        })
        .put("scadenzePagamento", JSONArray().apply { scadenzePagamento.forEach { put(scadenzaJson(it)) } })
        .put("revisioni", JSONArray().apply { revisioni.forEach { put(JSONObject().put("id", it.id).put("revisione", it.revisione).put("stato", it.stato).put("data", it.data?.toString() ?: "")) } })
        .put("mancano", JSONArray().apply { mancanoServer?.forEach { put(JSONObject().put("campo", it.campo).put("testo", it.testo)) } })
        .put("etichetta", etichetta.ifBlank { numeroCompleto.replace(" · ", " ") })
        // Tutte e due le forme: il server dice idSede, pc/ui/documenti.js legge sedeId.
        .put("idSede", idSede).put("idReferente", idReferente)
        .apply {
            val k = conto()
            put("conti", JSONObject().put("somma", k.somma).put("scontoPercentuale", k.scontoPercentuale).put("scontoEuro", k.scontoEuro)
                .put("imponibile", k.imponibile).put("contributo", k.contributo).put("baseIva", k.baseIva).put("iva", k.iva).put("totale", k.totale))
            put("totale", k.totale)
        }

    companion object {
        fun voceJson(v: VocePreventivo, ordine: Int): JSONObject = JSONObject()
            .put("id", v.id).put("descrizione", v.descrizione).put("modo", v.modo).put("quantita", v.quantita).put("unita", v.unita)
            .put("prezzo", v.prezzo ?: JSONObject.NULL).put("scontoPercentuale", v.scontoPercentuale).put("facoltativa", v.facoltativa)
            .put("alternativa", v.alternativa).put("scelta", v.scelta).put("idListino", v.idListino).put("ordine", ordine)
            .put("importo", ContiPreventivo.importoVoce(v))

        fun scadenzaJson(s: ScadenzaPagamento): JSONObject = JSONObject()
            .put("id", s.id).put("descrizione", s.descrizione).put("tipo", s.tipo).put("valore", s.valore).put("quando", s.quando)
            .put("data", s.data?.toString() ?: "").put("importo", s.importo ?: JSONObject.NULL)

        /**
         * Dal server: le voci possono arrivare dentro le sezioni o in un elenco a
         * parte con l'id della sezione. Le voci senza sezione vanno in una sezione
         * senza titolo, in cima.
         */
        fun daJson(o: JSONObject): Preventivo {
            val p = o.optJSONObject("preventivo") ?: o
            val sezioniJson = p.optJSONArray("sezioni").oggetti()
            val vociPiatte = p.optJSONArray("voci").oggetti()
            val sezioni = sezioniJson.mapIndexed { i, s ->
                val idSez = s.testo("id")
                val dentro = s.optJSONArray("voci").oggetti().ifEmpty {
                    vociPiatte.filter { v ->
                        val sv = v.primoTesto("idSezione", "sezioneId", "sezione_id")
                        (idSez.isNotBlank() && sv == idSez) || (sv.isBlank() && v.has("sezione") && v.optInt("sezione", -1) == i)
                    }
                }
                SezionePreventivo(idSez, s.testo("titolo"), dentro.map(VocePreventivo::daJson).sortedBy { it.ordine }, s.optInt("ordine", i + 1), s.numero("subtotale"))
            }.sortedBy { it.ordine }
            val idSezioni = sezioniJson.map { it.testo("id") }.filter { it.isNotBlank() }.toSet()
            val orfane = if (sezioniJson.isEmpty()) vociPiatte else vociPiatte.filter { v ->
                val sv = v.primoTesto("idSezione", "sezioneId", "sezione_id")
                sv.isBlank() && !v.has("sezione") || (sv.isNotBlank() && sv !in idSezioni)
            }
            val tutte = (if (orfane.isNotEmpty()) listOf(SezionePreventivo("", "", orfane.map(VocePreventivo::daJson).sortedBy { it.ordine })) else emptyList()) + sezioni
            return Preventivo(
                id = p.testo("id"),
                numero = p.testo("numero"),
                revisione = p.optInt("revisione", 0),
                idCliente = p.primoTesto("idCliente", "clienteId", "cliente_id"),
                nomeCliente = p.primoTesto("nomeCliente", "cliente").takeUnless { it == p.primoTesto("idCliente", "clienteId") }.orEmpty(),
                idSede = p.primoTesto("idSede", "sedeId", "sede_id"),
                idReferente = p.primoTesto("idReferente", "referenteId", "referente_id"),
                oggetto = p.testo("oggetto"),
                introduzione = p.testo("introduzione"),
                complessita = p.testo("complessita").lowercase(),
                complessitaNota = p.primoTesto("complessitaNota", "complessita_nota"),
                oneriPrevisti = p.primoTesto("oneriPrevisti", "oneri_previsti"),
                condizioni = p.testo("condizioni"),
                data = p.data("data"),
                scadenza = p.data("scadenza"),
                stato = p.testo("stato").uppercase().ifBlank { StatoPreventivo.BOZZA },
                statoCalcolato = p.primoTesto("statoCalcolato", "stato_calcolato", "statoVisto").uppercase(),
                scontoPercentuale = p.primoNumero("scontoPercentuale", "sconto_percentuale") ?: 0.0,
                scontoEuro = p.primoNumero("scontoEuro", "sconto_euro") ?: 0.0,
                eppiPercentuale = p.primoNumero("eppiPercentuale", "eppi_percentuale", "eppi"),
                ivaPercentuale = p.primoNumero("ivaPercentuale", "iva_percentuale"),
                inviatoIl = p.primoTesto("inviatoIl", "inviato_il"),
                accettatoIl = p.primoTesto("accettatoIl", "accettato_il"),
                accettatoDa = p.primoTesto("accettatoDa", "accettato_da"),
                accettazioneModo = p.primoTesto("accettazioneModo", "accettazione_modo", "modo"),
                idFirma = p.primoTesto("idFirma", "firmaFileId", "firma_file_id").ifBlank { FileRemoto.idDaUrl(p.optJSONObject("firma")?.testo("url").orEmpty()) },
                rifiutatoIl = p.primoTesto("rifiutatoIl", "rifiutato_il"),
                motivoRifiuto = p.primoTesto("motivoRifiuto", "motivo_rifiuto"),
                idCommessa = p.primoTesto("idCommessa", "commessaId", "commessa_id"),
                modello = p.vero("modello"),
                noteInterne = p.primoTesto("noteInterne", "note_interne"),
                sezioni = tutte,
                scadenzePagamento = (p.optJSONArray("scadenzePagamento") ?: p.optJSONArray("scadenze") ?: p.optJSONArray("pagamenti")).oggetti().map(ScadenzaPagamento::daJson),
                revisioni = p.optJSONArray("revisioni").oggetti().map(RevisionePreventivo::daJson),
                contiServer = ContoPreventivo.daJson(p.optJSONObject("conti") ?: o.optJSONObject("conti")),
                totaleServer = p.numero("totale") ?: p.optJSONObject("conti")?.numero("totale"),
                mancanoServer = (p.optJSONArray("mancano") ?: o.optJSONArray("mancano"))?.let { a ->
                    (0 until a.length()).mapNotNull { i ->
                        when (val x = a.opt(i)) {
                            is JSONObject -> Mancanza(x.primoTesto("campo", "chiave", "cosa"), x.primoTesto("testo", "frase", "nome"))
                            null, JSONObject.NULL -> null
                            else -> Mancanza(x.toString(), x.toString())
                        }
                    }.filter { it.campo.isNotBlank() || it.testo.isNotBlank() }
                },
                etichetta = p.testo("etichetta"),
                modificabile = p.booleanoONull("modificabile"),
                senzaPrezzo = p.optInt("senzaPrezzo", 0),
                giorniAllaScadenza = if (p.has("giorniAllaScadenza") && !p.isNull("giorniAllaScadenza")) p.optInt("giorniAllaScadenza") else null,
                imponibileServer = p.numero("imponibile"),
                creato = p.testo("creato"),
                modificato = p.testo("modificato"),
                grezzo = p,
            )
        }
    }
}

/**
 * I conti del preventivo, le regole di fase2.md §3 (le stesse del server):
 *  - importo voce = quantita' × prezzo × (1 − sconto voce), arrotondato al centesimo;
 *  - contano le voci non facoltative e le facoltative scelte; di ogni gruppo di
 *    alternative conta solo quella scelta;
 *  - imponibile = somma − sconto in percentuale − sconto in euro;
 *  - contributo integrativo = imponibile × EPPI; base IVA = imponibile + contributo;
 *  - IVA = base × IVA; totale = base + IVA.
 * Ogni pezzo e' arrotondato al centesimo prima di sommare, come i rapportini.
 */
object ContiPreventivo {

    /** Come Math.round di JavaScript (il mezzo verso l'alto), al centesimo: lo stesso numero del server. */
    fun centesimi(n: Double): Double = Math.floor(n * 100 + 0.5) / 100.0

    /** importoVoce() di server/src/conti.js: quantità × prezzo × (1 − sconto / 100), al centesimo. Senza prezzo, zero. */
    fun importoVoce(v: VocePreventivo): Double = centesimi(v.quantita * (v.prezzo ?: 0.0) * (1 - v.scontoPercentuale / 100))

    /**
     * Se una voce, da sola, conta nel totale: le normali sempre, facoltative e
     * alternative se scelte (o come l'ha detto il server). Per i conti esatti di
     * un gruppo di alternative serve [contano], che guarda tutte le voci insieme.
     */
    fun conta(v: VocePreventivo): Boolean = v.contaServer ?: when {
        v.inAlternativa -> v.scelta
        v.facoltativa -> v.scelta
        else -> true
    }

    /**
     * vociCheContano() di conti.js: le normali sempre, le facoltative se scelte, e
     * di ogni gruppo di alternative solo la PRIMA scelta. Stesso ordine delle voci.
     */
    fun contano(voci: List<VocePreventivo>): List<Boolean> {
        val presi = HashSet<String>()
        return voci.map { v ->
            when {
                v.inAlternativa -> v.scelta && presi.add(v.gruppo)
                v.facoltativa -> v.scelta
                else -> true
            }
        }
    }

    /** La somma delle voci che contano, arrotondando passo per passo (una sezione sola). */
    fun somma(voci: List<VocePreventivo>): Double = calcolaSezioni(listOf(voci), 0.0, 0.0, 0.0, 0.0).somma

    /** Il conto di voci in una sezione sola (l'anteprima di un pezzo). */
    fun calcola(voci: List<VocePreventivo>, scontoPercentuale: Double, scontoEuro: Double, eppiPercentuale: Double, ivaPercentuale: Double): ContoPreventivo =
        calcolaSezioni(listOf(voci), scontoPercentuale, scontoEuro, eppiPercentuale, ivaPercentuale)

    /**
     * contiPreventivo() di server/src/conti.js, passo per passo: le voci di ogni
     * sezione nel subtotale, i subtotali nella somma, poi sconti, contributo, IVA,
     * totale, e le scadenze. Ogni pezzo arrotondato al centesimo prima di sommare.
     */
    fun calcolaSezioni(
        sezioni: List<List<VocePreventivo>>,
        scontoPercentuale: Double,
        scontoEuro: Double,
        eppiPercentuale: Double,
        ivaPercentuale: Double,
        scadenze: List<ScadenzaPagamento> = emptyList(),
    ): ContoPreventivo {
        val tutte = sezioni.flatten()
        val conta = contano(tutte)
        var i = 0
        var somma = 0.0
        var ore = 0.0
        val importi = ArrayList<Double>()
        val subtotali = sezioni.map { lista ->
            var sub = 0.0
            for (v in lista) {
                val importo = importoVoce(v)
                val c = conta[i++]
                importi += importo
                if (c) {
                    sub = centesimi(sub + importo)
                    if (v.modo == ModoVoce.ORE) ore += v.quantita
                }
            }
            somma = centesimi(somma + sub)
            sub
        }
        val sp = centesimi(somma * scontoPercentuale / 100)
        val se = centesimi(scontoEuro)
        val imponibile = centesimi(somma - sp - se)
        val contributo = centesimi(imponibile * eppiPercentuale / 100)
        val base = centesimi(imponibile + contributo)
        val iva = centesimi(base * ivaPercentuale / 100)
        val quote = scadenze.map { s -> if (s.tipo == ScadenzaPagamento.IMPORTO) centesimi(s.valore) else centesimi(imponibile * s.valore / 100) }
        var coperto = 0.0
        quote.forEach { coperto = centesimi(coperto + it) }
        return ContoPreventivo(
            somma, sp, se, imponibile, contributo, base, iva, centesimi(base + iva),
            oreVoci = Math.floor(ore * 100 + 0.5) / 100.0,
            senzaPrezzo = tutte.count { (it.prezzo ?: 0.0) <= 0.0 },
            restoScadenze = centesimi(imponibile - coperto),
            subtotali = subtotali, importi = importi, contano = conta, scadenze = quote,
        )
    }

    /** Il conto di un preventivo, con le sue sezioni e scadenze. */
    fun calcola(p: Preventivo, eppiPredefinito: Double, ivaPredefinita: Double): ContoPreventivo =
        calcolaSezioni(p.sezioni.map { it.voci }, p.scontoPercentuale, p.scontoEuro, p.eppiPercentuale ?: eppiPredefinito, p.ivaPercentuale ?: ivaPredefinita, p.scadenzePagamento)

    /**
     * Le scelte del cliente all'accettazione: [scelte] idVoce -> scelta. Per le
     * alternative, sceglierne una toglie le altre dello stesso gruppo.
     */
    fun conScelte(voci: List<VocePreventivo>, scelte: Map<String, Boolean>): List<VocePreventivo> {
        var out = voci.map { v -> scelte[v.id]?.let { v.copy(scelta = it) } ?: v }
        // Come applicaScelte() di conti.js: un'alternativa scelta toglie le altre del suo gruppo.
        out.filter { it.inAlternativa && scelte[it.id] == true }.forEach { sc ->
            out = out.map { x -> if (x.id != sc.id && x.inAlternativa && x.gruppo == sc.gruppo) x.copy(scelta = false) else x }
        }
        return out
    }

    /** L'importo di una scadenza di pagamento: percentuale dell'imponibile o importo fisso (importoScadenza di conti.js). */
    fun importoScadenza(s: ScadenzaPagamento, imponibile: Double): Double =
        s.importo ?: if (s.tipo == ScadenzaPagamento.IMPORTO) centesimi(s.valore) else centesimi(imponibile * s.valore / 100)

    /** Tocca una voce da scegliere: la facoltativa cambia, l'alternativa diventa la sola scelta del suo gruppo. */
    fun tocca(voci: List<VocePreventivo>, idVoce: String): List<VocePreventivo> {
        val v = voci.firstOrNull { it.id == idVoce } ?: return voci
        return when {
            v.inAlternativa -> voci.map { if (it.inAlternativa && it.gruppo == v.gruppo) it.copy(scelta = it.id == idVoce) else it }
            v.facoltativa -> voci.map { if (it.id == idVoce) it.copy(scelta = !it.scelta) else it }
            else -> voci
        }
    }

    /** Il totale di una sezione: quello del server, o le sue voci che contano. */
    fun subtotale(s: SezionePreventivo): Double = s.subtotaleServer ?: somma(s.voci)

    /**
     * Quello che la legge chiede (fase2.md §2.1): complessita', voci con un prezzo,
     * oneri ipotizzabili, polizza, titoli. Il server lo dice in `mancano`; quando
     * non c'e' (la visita, una bozza nuova) lo si guarda qui dalle impostazioni.
     */
    fun legge(p: Preventivo, impostazioni: Map<String, String>): List<RichiestaLegge> {
        val m = p.mancanoServer?.map { (it.campo + " " + it.testo).lowercase() }
        fun manca(chiave: String, vararg parole: String, locale: () -> Boolean): Boolean =
            if (m != null) m.any { x -> x.startsWith("$chiave ") || x == chiave || parole.any { x.contains(it) } } else locale()
        return listOf(
            RichiestaLegge("complessita", "Grado di complessità", !manca("complessita", "complessit") { p.complessita.isBlank() }),
            RichiestaLegge("prezzi", "Voci con spese, oneri e contributi", !manca("prezzi", "senza prezzo") {
                p.voci.isEmpty() || p.voci.any { it.prezzo == null || it.prezzo <= 0.0 } || p.senzaPrezzo > 0
            } && !manca("voci", "nessuna voce") { p.voci.isEmpty() }),
            RichiestaLegge("oneri", "Oneri ipotizzabili", !manca("oneri", "oneri") { p.oneriPrevisti.isBlank() }),
            RichiestaLegge("polizza", "Polizza professionale", !manca("polizza", "polizza", "assicura") {
                impostazioni[POLIZZA_COMPAGNIA].isNullOrBlank() || impostazioni[POLIZZA_NUMERO].isNullOrBlank()
            }),
            RichiestaLegge("titoli", "Titoli e specializzazioni", !manca("titoli", "titol") { impostazioni[TITOLI].isNullOrBlank() }),
        )
    }

    // Le impostazioni nuove della fase 2 (fase2.md §3).
    const val POLIZZA_COMPAGNIA = "POLIZZA_COMPAGNIA"
    const val POLIZZA_NUMERO = "POLIZZA_NUMERO"
    const val POLIZZA_MASSIMALE = "POLIZZA_MASSIMALE"
    const val TITOLI = "TITOLI"
    const val IVA = "IVA"
    const val EPPI_INTEGRATIVO = "EPPI_INTEGRATIVO"
    const val RITENUTA = "RITENUTA"
    const val PREVENTIVO_VALIDITA_GIORNI = "PREVENTIVO_VALIDITA_GIORNI"
    const val PREVENTIVO_CONDIZIONI = "PREVENTIVO_CONDIZIONI"

    /** IVA ed EPPI delle impostazioni, coi valori di partenza (22 e 5) se non ci sono. */
    fun iva(impostazioni: Map<String, String>): Double = Numeri.leggi(impostazioni[IVA]) ?: 22.0
    fun eppi(impostazioni: Map<String, String>): Double = Numeri.leggi(impostazioni[EPPI_INTEGRATIVO]) ?: 5.0
    fun validita(impostazioni: Map<String, String>): Long = Numeri.leggi(impostazioni[PREVENTIVO_VALIDITA_GIORNI])?.toLong()?.takeIf { it > 0 } ?: 30L
}

// ---------------------------------------------------------------------------------- aiuti per i JSON

/** Il primo campo che c'e' fra quelli dati: i nomi del server e dei file vecchi possono cambiare un po'. */
internal fun JSONObject.primoTesto(vararg campi: String): String {
    for (c in campi) {
        val t = testo(c)
        if (t.isNotBlank()) return t
    }
    return ""
}

internal fun JSONObject.primoNumero(vararg campi: String): Double? {
    for (c in campi) numero(c)?.let { return it }
    return null
}
