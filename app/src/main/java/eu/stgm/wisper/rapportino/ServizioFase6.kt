package eu.stgm.wisper.rapportino

import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.temporal.ChronoUnit
import java.util.Base64
import java.util.UUID

/*
 * Le azioni della fase 6 (architettura.md §17), coi nomi esatti del server, e il
 * servizio che le schermate chiamano: le letture che restano sul telefono (solo le
 * proprie, §3.13, e mai i dati personali dei colleghi: PrivacyDisco), la coda per
 * quello che si fa anche senza rete, le cose ancora in coda mostrate subito.
 */

/** Le chiamate al server della fase 6: lanciano le eccezioni di [PonteServer]. */
class Fase6(private val t: TrasportoFase5) {

    private fun corpo(azione: String) = JSONObject().put("azione", azione)
    private fun idJson(id: String): Any = PonteServer.idJson(id)
    private fun JSONObject.obbligo(chiave: String, cosa: String): JSONObject = optJSONObject(chiave) ?: throw PonteServer.Rifiutato("Il server non ha restituito $cosa")

    // -------------------------------------------------- persone (§17.3-§17.7)

    suspend fun persone(stato: String = "attive"): Organico = Organico.daJson(t.leggiAzione("persone", listOf("stato" to stato)))

    /** La scheda: senza [id] la propria. */
    suspend fun personaJson(id: String?): JSONObject = t.leggiAzione("persona", if (id.isNullOrBlank()) emptyList() else listOf("id" to id))

    suspend fun persona(id: String?): Persona = Persona.daJson(personaJson(id).obbligo("persona", "la scheda"))

    suspend fun salvaPersona(p: JSONObject): Persona = Persona.daJson(t.scriviAzione(corpo("salvaPersona").put("persona", p)).obbligo("persona", "la scheda"))

    /** Torna i costi e la frase di conferma ("Vale per le ore e i rapportini nuovi dal …"). */
    suspend fun salvaCostoPersona(idPersona: String, dal: LocalDate, costoOrario: Double?, costoAnno: Double?, oreAnno: Double?, nota: String): Pair<List<CostoPersona>, String> {
        val c = corpo("salvaCostoPersona").put("idPersona", idJson(idPersona)).put("dal", dal.toString())
        costoOrario?.let { c.put("costoOrario", it) }
        costoAnno?.let { c.put("costoAnno", it) }
        oreAnno?.let { c.put("oreAnno", it) }
        if (nota.isNotBlank()) c.put("nota", nota.trim())
        val r = t.scriviAzione(c)
        return r.optJSONArray("costi").oggetti().map(CostoPersona::daJson) to r.testo("frase")
    }

    /** Crea l'utente e torna la password iniziale (si mostra una volta sola). */
    suspend fun daiAccesso(idPersona: String, email: String, ruolo: String): String =
        t.scriviAzione(corpo("daiAccesso").put("idPersona", idJson(idPersona)).put("email", email.trim()).put("ruolo", ruolo)).testo("passwordIniziale")

    suspend fun salvaQualifica(q: JSONObject, rinnova: String? = null): Qualifica {
        val c = corpo("salvaQualifica").put("qualifica", q)
        if (!rinnova.isNullOrBlank()) c.put("rinnova", idJson(rinnova))
        return Qualifica.daJson(t.scriviAzione(c).obbligo("qualifica", "la qualifica"))
    }

    suspend fun qualificheTipi(): List<TipoQualifica> = t.leggiAzione("qualificheTipi").optJSONArray("tipi").oggetti().map(TipoQualifica::daJson)

    /** Un tipo di formazione nuovo o cambiato (§5.3): torna l'elenco. */
    suspend fun salvaQualificaTipo(tipo: JSONObject): List<TipoQualifica> =
        t.scriviAzione(corpo("salvaQualificaTipo").put("tipo", tipo)).optJSONArray("tipi").oggetti().map(TipoQualifica::daJson)

    suspend fun salvaVisita(v: JSONObject): Visita = Visita.daJson(t.scriviAzione(corpo("salvaVisita").put("visita", v)).obbligo("visita", "la visita"))

    suspend fun dpi(idPersona: String? = null): List<ConsegnaDpi> =
        t.leggiAzione("dpi", if (idPersona.isNullOrBlank()) emptyList() else listOf("idPersona" to idPersona)).optJSONArray("consegne").oggetti().map(ConsegnaDpi::daJson)

    suspend fun salvaConsegnaDpi(c: JSONObject, firmaPng: ByteArray?): ConsegnaDpi {
        val x = corpo("salvaConsegnaDpi").put("consegna", c)
        if (firmaPng != null) x.put("firma", JSONObject().put("base64", Base64.getEncoder().encodeToString(firmaPng)).put("mime", "image/png"))
        return ConsegnaDpi.daJson(t.scriviAzione(x).obbligo("consegna", "la consegna"))
    }

    suspend fun firmaConsegna(id: String, png: ByteArray, idFile: String): ConsegnaDpi =
        ConsegnaDpi.daJson(t.scriviAzione(corpo("firmaConsegna").put("id", idJson(id)).put("base64", Base64.getEncoder().encodeToString(png)).put("mime", "image/png").put("idFile", idFile)).obbligo("consegna", "la consegna"))

    suspend fun restituisciDpi(id: String): ConsegnaDpi = ConsegnaDpi.daJson(t.scriviAzione(corpo("restituisciDpi").put("id", idJson(id))).obbligo("consegna", "la consegna"))

    /** Senza [conferma] il server dice cosa succede (DaConfermare con la risposta intera). */
    suspend fun segnaUscita(idPersona: String, data: LocalDate, motivo: String, conferma: Boolean): JSONObject {
        val c = corpo("segnaUscita").put("idPersona", idJson(idPersona)).put("data", data.toString())
        if (motivo.isNotBlank()) c.put("motivo", motivo.trim())
        if (conferma) c.put("conferma", true)
        return t.scriviAzione(c)
    }

    /** Chi ha visto i dati riservati: di una persona, o di tutti (il registro del titolare) senza [idPersona]. */
    suspend fun accessiRiservati(idPersona: String, utente: String = "", da: String = "", a: String = ""): List<AccessoRiservato> =
        t.leggiAzione("accessiRiservati", listOf("idPersona" to idPersona, "utente" to utente, "da" to da, "a" to a).filter { it.second.isNotBlank() })
            .optJSONArray("righe").oggetti().map(AccessoRiservato::daJson)

    // -------------------------------------------------- assenze, chiusure, presenze (§17.8-§17.9)

    suspend fun assenzeJson(parametri: List<Pair<String, String>> = emptyList()): JSONObject = t.leggiAzione("assenze", parametri)

    /** L'esito di salvaAssenza: l'assenza, le anomalie (frasi), i saldi e se era già arrivata. */
    data class EsitoAssenza(val assenza: Assenza, val anomalie: List<String>, val saldi: Saldi?, val giaArrivata: Boolean)

    suspend fun salvaAssenza(a: JSONObject): EsitoAssenza {
        val r = t.scriviAzione(corpo("salvaAssenza").put("assenza", a))
        return EsitoAssenza(
            Assenza.daJson(r.obbligo("assenza", "l'assenza")), r.optJSONArray("anomalie").oggetti().map { it.testo("testo") }.filter { it.isNotBlank() },
            Saldi.daJson(r.optJSONObject("saldi")), r.vero("giaArrivata"),
        )
    }

    suspend fun annullaAssenza(id: String, motivo: String): Assenza? {
        val c = corpo("annullaAssenza").put("id", idJson(id))
        if (motivo.isNotBlank()) c.put("motivo", motivo.trim())
        return t.scriviAzione(c).optJSONObject("assenza")?.let(Assenza::daJson)
    }

    suspend fun saldi(idPersona: String): Saldi? = Saldi.daJson(t.leggiAzione("saldi", listOf("idPersona" to idPersona)).optJSONObject("saldi"))

    suspend fun salvaSaldo(idPersona: String, tipo: String, data: LocalDate, ore: Double, nota: String): Saldi? {
        val c = corpo("salvaSaldo").put("idPersona", idJson(idPersona)).put("tipo", tipo).put("data", data.toString()).put("ore", ore)
        if (nota.isNotBlank()) c.put("nota", nota.trim())
        return Saldi.daJson(t.scriviAzione(c).optJSONObject("saldi"))
    }

    suspend fun chiusureJson(anno: Int? = null): JSONObject = t.leggiAzione("chiusure", anno?.let { listOf("anno" to it.toString()) } ?: emptyList())

    suspend fun presenze(mese: String, idPersona: String? = null): Presenze =
        Presenze.daJson(t.leggiAzione("presenze", buildList { add("mese" to mese); if (!idPersona.isNullOrBlank()) add("idPersona" to idPersona) }))

    // -------------------------------------------------- mezzi (§17.10)

    suspend fun mezziJson(tutti: Boolean = false): JSONObject = t.leggiAzione("mezzi", if (tutti) listOf("tutti" to "1") else emptyList())

    suspend fun mezzoJson(id: String): JSONObject = t.leggiAzione("mezzo", listOf("id" to id))

    suspend fun salvaMezzo(m: JSONObject): Mezzo = Mezzo.daJson(t.scriviAzione(corpo("salvaMezzo").put("mezzo", m)).obbligo("mezzo", "il mezzo"))

    /** segnaKm: torna il mezzo aggiornato (ripetuta con lo stesso idLocale: la stessa lettura). */
    suspend fun segnaKm(c: JSONObject): JSONObject = t.scriviAzione(JSONObject(c.toString()).put("azione", "segnaKm"))

    /** La foto del contachilometri o di un guasto (caricaFile, lo stesso [idFile] a ogni tentativo). */
    suspend fun caricaFotoMezzo(tipo: String, chiave: String, dati: ByteArray, idFile: String): FileRemoto {
        val c = corpo("caricaFile").put("tipo", tipo).put("mime", "image/jpeg").put("idFile", idFile).put("base64", Base64.getEncoder().encodeToString(dati))
        val km = tipo == "km"
        val numero = chiave.toLongOrNull()
        if (numero != null) c.put(if (km) "idLettura" else "idManutenzione", numero)
        else c.put(if (km) "idLocaleLettura" else "idLocaleManutenzione", chiave)
        val r = t.scriviAzione(c)
        return FileRemoto.daJson(r.optJSONObject("file") ?: r)
    }

    suspend fun segnalaGuasto(g: JSONObject): Manutenzione = Manutenzione.daJson(t.scriviAzione(corpo("segnalaGuasto").put("guasto", g)).obbligo("manutenzione", "il guasto"))

    suspend fun chiudiManutenzione(id: String, esito: String): Manutenzione {
        val c = corpo("chiudiManutenzione").put("id", idJson(id))
        if (esito.isNotBlank()) c.put("esito", esito.trim())
        return Manutenzione.daJson(t.scriviAzione(c).obbligo("manutenzione", "la manutenzione"))
    }

    suspend fun manutenzioni(aperte: Boolean = false): List<Manutenzione> =
        t.leggiAzione("manutenzioni", if (aperte) listOf("aperte" to "1") else emptyList()).optJSONArray("manutenzioni").oggetti().map(Manutenzione::daJson)

    suspend fun costiMezzo(id: String): CostiMezzo? = CostiMezzo.daJson(t.leggiAzione("costiMezzo", listOf("id" to id)))

    // -------------------------------------------------- attrezzature, tarature, assegnazioni (§17.11-§17.12)

    suspend fun attrezzatureJson(parametri: List<Pair<String, String>> = emptyList()): JSONObject = t.leggiAzione("attrezzature", parametri)

    suspend fun attrezzatura(id: String): Attrezzatura = Attrezzatura.daJson(t.leggiAzione("attrezzatura", listOf("id" to id)).obbligo("attrezzatura", "lo strumento"))

    suspend fun salvaAttrezzatura(a: JSONObject): Attrezzatura = Attrezzatura.daJson(t.scriviAzione(corpo("salvaAttrezzatura").put("attrezzatura", a)).obbligo("attrezzatura", "lo strumento"))

    /** Torna lo strumento e, per un non conforme, la frase degli usi da controllare. */
    suspend fun registraTaratura(x: JSONObject): Pair<Attrezzatura, String> {
        val r = t.scriviAzione(corpo("registraTaratura").put("taratura", x))
        return Attrezzatura.daJson(r.obbligo("attrezzatura", "lo strumento")).let { a -> a.copy(usiDaControllare = r.optJSONArray("usiDaControllare").oggetti().map(UsoStrumento::daJson).ifEmpty { a.usiDaControllare }) } to r.testo("fraseUsi")
    }

    suspend fun assegna(c: JSONObject): JSONObject = t.scriviAzione(JSONObject(c.toString()).put("azione", "assegna"))

    suspend fun restituisci(c: JSONObject): JSONObject = t.scriviAzione(JSONObject(c.toString()).put("azione", "restituisci"))

    suspend fun assegnazioni(parametri: List<Pair<String, String>> = emptyList()): List<Assegnazione> =
        t.leggiAzione("assegnazioni", parametri).optJSONArray("assegnazioni").oggetti().map(Assegnazione::daJson)

    // -------------------------------------------------- collaboratori esterni (§17.14)

    suspend fun collaboratori(): List<RigaCollaboratore> = t.leggiAzione("collaboratori").optJSONArray("collaboratori").oggetti().map(RigaCollaboratore::daJson)

    /** La scheda: senza [id] quella dell'esterno che è entrato. */
    suspend fun collaboratoreJson(id: String?): JSONObject = t.leggiAzione("collaboratore", if (id.isNullOrBlank()) emptyList() else listOf("id" to id))

    suspend fun salvaCollaboratore(c: JSONObject): Pair<Collaboratore, Boolean> {
        val r = t.scriviAzione(corpo("salvaCollaboratore").put("collaboratore", c))
        return Collaboratore.daJson(r.obbligo("collaboratore", "il collaboratore")) to r.vero("giaEsisteva")
    }

    suspend fun invitaEsterno(idSoggetto: String, nome: String, email: String): String =
        t.scriviAzione(corpo("invitaEsterno").put("idSoggetto", idSoggetto).put("nome", nome.trim()).put("email", email.trim())).testo("passwordIniziale")

    suspend fun incarichiJson(stato: String = "tutti", idSoggetto: String = "", idCommessa: String = ""): JSONObject =
        t.leggiAzione("incarichi", buildList { add("stato" to stato); if (idSoggetto.isNotBlank()) add("idSoggetto" to idSoggetto); if (idCommessa.isNotBlank()) add("idCommessa" to idCommessa) })

    /** Le parti nuove del costo della commessa (§17.15): collaboratori, previsto, altre fatture ricevute (null senza `costi`). */
    data class CostiEsterni(val collaboratori: Double?, val collaboratoriPrevisto: Double?, val altreRicevute: Double?)

    suspend fun costiEsterni(idCommessa: String): CostiEsterni {
        val k = t.leggiAzione("costoCommessa", listOf("idCommessa" to idCommessa)).optJSONObject("costoCommessa")
        return CostiEsterni(k?.numero("collaboratori"), k?.numero("collaboratoriPrevisto"), k?.numero("altreRicevute"))
    }

    suspend fun incarico(id: String): Incarico = Incarico.daJson(t.leggiAzione("incarico", listOf("id" to id)).obbligo("incarico", "l'incarico"))

    suspend fun salvaIncarico(i: JSONObject): Incarico = Incarico.daJson(t.scriviAzione(corpo("salvaIncarico").put("incarico", i)).obbligo("incarico", "l'incarico"))

    /** affidaIncarico, aggiornaAvanzamento, concludiIncarico, riapriIncarico, annullaIncarico, valutaIncarico. */
    suspend fun azioneIncarico(azione: String, id: String, campi: JSONObject = JSONObject()): Incarico {
        val c = corpo(azione).put("id", idJson(id))
        campi.keys().forEach { k -> c.put(k, campi.get(k)) }
        return Incarico.daJson(t.scriviAzione(c).obbligo("incarico", "l'incarico"))
    }

    /** Le ore di un collaboratore senza accesso: le scrive chi segue l'incarico (salvaOre senza utente, con l'incarico). */
    suspend fun oreCollaboratore(i: Incarico, data: LocalDate, ore: Double, descrizione: String) {
        t.scriviAzione(corpo("salvaOre").put("ore", JSONObject().put("idIncarico", idJson(i.id)).put("idCommessa", i.idCommessa).put("data", data.toString())
            .put("ore", ore).put("descrizione", descrizione).put("idLocale", ServizioFase6.nuovoId("O"))))
    }

    data class RigaCompensi(val idSoggetto: String, val nome: String, val compensi: Compensi)

    suspend fun compensi(anno: Int? = null): Pair<List<RigaCompensi>, Compensi?> {
        val r = t.leggiAzione("compensi", anno?.let { listOf("anno" to it.toString()) } ?: emptyList())
        return r.optJSONArray("righe").oggetti().mapNotNull { o -> Compensi.daJson(o)?.let { RigaCompensi(o.testo("idSoggetto"), o.testo("nome"), it) } } to Compensi.daJson(r.optJSONObject("totale"))
    }
}

/** Quello che si fa anche senza rete (§3.13): va nella coda su disco. Lo fa Archivio; nella visita guidata niente. */
interface CodaFase6 {
    fun assenza(chiave: String, corpo: JSONObject)
    fun annullaAssenza(id: String, corpo: JSONObject)
    /** Toglie dalla coda una richiesta nata qui e non ancora partita (Annulla). Torna vero se c'era. */
    fun togliAssenzaInCoda(chiave: String): Boolean
    fun km(chiave: String, corpo: JSONObject)
    fun fotoKm(chiave: String, file: File)
    fun guasto(chiave: String, corpo: JSONObject)
    fun fotoGuasto(chiave: String, file: File)
    fun prestito(chiave: String, corpo: JSONObject)
    fun restituisci(chiave: String, corpo: JSONObject)
    fun firmaDpi(id: String, file: File)
}

/**
 * Come partono dalla coda le cose della fase 6. SENZA DOPPIONI: ogni riga parte col
 * suo idLocale (ripetuto, il server torna la stessa con giaArrivata), le foto con lo
 * stesso idFile, la firma di una consegna già firmata non si rifà.
 */
class InvioFase6(private val f: Fase6) {
    suspend fun esegui(op: CodaInvii.Operazione) {
        when (op.tipo) {
            CodaInvii.Tipo.ASSENZA -> f.salvaAssenza(op.corpoJson().put("idLocale", op.idLocale))
            CodaInvii.Tipo.ANNULLA_ASSENZA -> {
                val c = op.corpoJson()
                try {
                    f.annullaAssenza(op.idLocale.removePrefix("assenza:"), c.testo("motivo"))
                } catch (e: PonteServer.Rifiutato) {
                    // Ripetuta dopo che era già arrivata: è già annullata, niente da rifare.
                    if (e.message?.contains("annullata") != true) throw e
                }
            }
            CodaInvii.Tipo.KM -> f.segnaKm(op.corpoJson().put("idLocale", op.idLocale))
            CodaInvii.Tipo.GUASTO -> f.segnalaGuasto(op.corpoJson().put("idLocale", op.idLocale))
            CodaInvii.Tipo.FOTO_KM, CodaInvii.Tipo.FOTO_GUASTO -> {
                val file = File(op.percorso)
                if (!file.exists()) throw PonteServer.Rifiutato("La foto non è più sul telefono")
                f.caricaFotoMezzo(if (op.tipo == CodaInvii.Tipo.FOTO_KM) "km" else "guasto", op.idLocale, file.readBytes(), op.idFile)
            }
            CodaInvii.Tipo.PRESTITO -> f.assegna(op.corpoJson().put("idLocale", op.idLocale))
            CodaInvii.Tipo.RESTITUISCI -> f.restituisci(op.corpoJson().put("idLocale", op.idLocale))
            CodaInvii.Tipo.FIRMA_DPI -> {
                val file = File(op.percorso)
                if (!file.exists()) throw PonteServer.Rifiutato("La firma non è più sul telefono")
                f.firmaConsegna(op.idLocale.removePrefix("dpi:"), file.readBytes(), op.idFile)
            }
            else -> throw IllegalArgumentException("Non è un'operazione della fase 6: ${op.tipo}")
        }
    }
}

// ---------------------------------------------------------------------------------- le cose ancora in coda

/**
 * Le cose della fase 6 scritte sul telefono e non ancora arrivate, mostrate subito
 * (§3.13): la richiesta di ferie fra le mie, i km nuovi sul mio mezzo, il guasto in
 * cima ai guasti, lo strumento preso o restituito. Funzioni pure: le prove le rifanno.
 */
object InCoda6 {
    private fun vive(ops: List<CodaInvii.Operazione>) = ops.filter { !it.rifiutata }

    /** Un'assenza da una richiesta in coda, coi giorni e le ore rifatti sul telefono. */
    fun assenzaDaCorpo(op: CodaInvii.Operazione, idPersona: String, nome: String, oreSettimana: Double?, giorniSettimana: List<Int>, patrono: String, statoSeChiede: String): Assenza {
        val c = op.corpoJson()
        val tipo = c.testo("tipo")
        val dal = c.data("dal") ?: LocalDate.now()
        val al = c.data("al") ?: dal
        val festivi = ContiPersone.festiviTra(dal, al, patrono)
        val (giorni, ore) = ContiPersone.oreAssenza(
            ContiPersone.DatiAssenza(tipo, dal, al, c.testo("mezza"), c.testo("dalle"), c.testo("alle"), c.numero("ore")),
            oreSettimana, giorniSettimana, festivi,
        )
        val stato = if (tipo in ParolePersone.SANITARIE) "approvata" else statoSeChiede
        return Assenza(
            id = "", idLocale = op.idLocale, idPersona = c.testo("idPersona").ifBlank { idPersona }, persona = nome, tipo = tipo,
            tipoVisto = if (tipo == "altro") c.testo("causale").ifBlank { "Altro" } else ParolePersone.TIPI[tipo] ?: "Assente",
            causale = c.testo("causale"), dal = dal.toString(), al = al.toString(), mezza = c.testo("mezza"), dalle = c.testo("dalle"), alle = c.testo("alle"),
            giorni = giorni, ore = ore, stato = stato, statoVisto = ParolePersone.STATI[stato].orEmpty(), nota = c.testo("nota"), protocollo = c.testo("protocollo"),
            puoAnnullare = true, inCoda = true,
        )
    }

    /** Le assenze lette con sopra la coda: le nuove (non ancora arrivate) e quelle annullate qui. */
    fun applicaAssenze(lette: List<Assenza>, ops: List<CodaInvii.Operazione>, nuova: (CodaInvii.Operazione) -> Assenza): List<Assenza> {
        val v = vive(ops)
        val annullate = v.filter { it.tipo == CodaInvii.Tipo.ANNULLA_ASSENZA }.map { it.idLocale.removePrefix("assenza:") }.toSet()
        val arrivate = lette.map { it.idLocale }.filter { it.isNotBlank() }.toSet()
        val nuove = v.filter { it.tipo == CodaInvii.Tipo.ASSENZA && it.idLocale !in arrivate }.map(nuova)
        return (lette.map { if (it.id in annullate) it.copy(stato = "annullata", statoVisto = "Annullata", inCoda = true) else it } + nuove)
            .sortedBy { it.dal }
    }

    /** Il mezzo con sopra i km in coda (l'ultima lettura più alta) e i guasti segnalati qui. */
    fun applicaMezzo(m: Mezzo, ops: List<CodaInvii.Operazione>): Mezzo {
        val v = vive(ops)
        val km = v.filter { it.tipo == CodaInvii.Tipo.KM && it.corpoJson().testo("idVeicolo") == m.id }
        val guasti = v.filter { it.tipo == CodaInvii.Tipo.GUASTO && it.corpoJson().testo("idVeicolo") == m.id }
            .filter { op -> m.manutenzioni.none { it.idLocale == op.idLocale } }
        var r = m
        km.maxByOrNull { it.corpoJson().numero("km") ?: 0.0 }?.let { op ->
            val c = op.corpoJson()
            val k = c.numero("km")?.toLong()
            if (k != null && (m.km == null || k >= m.km)) {
                val tagliando = m.kmAlTagliando?.let { it - (k - (m.km ?: k)) }
                r = r.copy(km = k, kmIl = c.testo("data"), kmAlTagliando = tagliando,
                    letture = listOf(LetturaKm("", op.idLocale, c.testo("data"), k, "mano", "", ops.any { it.tipo == CodaInvii.Tipo.FOTO_KM && it.idLocale == op.idLocale })) + m.letture)
            }
        }
        if (guasti.isNotEmpty()) {
            r = r.copy(
                manutenzioni = guasti.map { manutenzioneDaCorpo(it, ops) } + r.manutenzioni,
                guastiAperti = r.guastiAperti + guasti.size,
            )
        }
        return r
    }

    /** Un guasto in coda, con le sue foto ancora sul telefono. */
    fun manutenzioneDaCorpo(op: CodaInvii.Operazione, ops: List<CodaInvii.Operazione>): Manutenzione {
        val c = op.corpoJson()
        return Manutenzione(
            id = "", idLocale = op.idLocale, idVeicolo = c.testo("idVeicolo"), idAttrezzatura = c.testo("idAttrezzatura"), tipo = "guasto", stato = "aperta",
            statoVisto = "Segnalato", fermo = c.vero("fermo"), data = c.testo("data").ifBlank { op.quando.take(10) }, km = c.numero("km")?.toLong(),
            titolo = c.testo("titolo"), descrizione = c.testo("descrizione"), inCoda = true,
            fotoInAttesa = ops.filter { it.tipo == CodaInvii.Tipo.FOTO_GUASTO && it.idLocale == op.idLocale }.map { File(it.percorso) },
        )
    }

    /** Gli strumenti con sopra Lo prendo io e Restituisci in coda. */
    fun applicaAttrezzature(l: List<Attrezzatura>, ops: List<CodaInvii.Operazione>, idPersona: String, nome: String): List<Attrezzatura> {
        val v = vive(ops)
        val prese = v.filter { it.tipo == CodaInvii.Tipo.PRESTITO }.mapNotNull { it.corpoJson().testo("idAttrezzatura").ifBlank { null } }.toSet()
        val rese = v.filter { it.tipo == CodaInvii.Tipo.RESTITUISCI }.mapNotNull { it.corpoJson().testo("idAttrezzatura").ifBlank { null } }.toSet()
        return l.map { a ->
            when (a.id) {
                in rese -> a.copy(mio = false, stato = "disponibile", statoVisto = "Disponibile", chi = null)
                in prese -> a.copy(mio = true, stato = "prestito", statoVisto = "In prestito a $nome", chi = Chi(tipo = "prestito", idPersona = idPersona, nome = nome, dal = LocalDate.now().toString()))
                else -> a
            }
        }
    }
}

/** I controlli dei km sul telefono (§7.2), uguali al server, prima di metterli in coda. */
object ControlloKm {
    sealed interface Esito {
        data object Va : Esito
        data class No(val messaggio: String) : Esito
        data class Conferma(val messaggio: String) : Esito
    }

    /** km non meno dell'ultima lettura di un giorno uguale o prima; più di 5.000 in meno di 7 giorni chiede conferma. */
    fun controlla(km: Long?, data: LocalDate, ultimoKm: Long?, ultimaData: LocalDate?): Esito {
        if (km == null || km < 0) return Esito.No("Km: scrivi i km del contachilometri")
        if (ultimoKm == null || ultimaData == null) return Esito.Va
        if (!ultimaData.isAfter(data) && km < ultimoKm) return Esito.No("Km: l'ultima lettura era ${ContiMezzi.km(ultimoKm)} il ${ultimaData.format(java.time.format.DateTimeFormatter.ofPattern("dd/MM"))}")
        val giorni = ChronoUnit.DAYS.between(ultimaData, data)
        if (km - ultimoKm > 5000 && giorni in 0..6) {
            val g = if (giorni <= 0L) 1L else giorni
            return Esito.Conferma("Sono ${ContiMezzi.km(km - ultimoKm)} km in " + (if (g == 1L) "1 giorno" else "$g giorni") + ": è giusto?")
        }
        return Esito.Va
    }
}

/**
 * Quello che le schermate della fase 6 chiamano: le azioni come Result, le copie sul
 * telefono (solo le mie, senza i dati personali dei colleghi), la coda.
 *
 * @param idPersonaMia la persona di chi è entrato (per tenere sul disco solo le sue cose intere).
 * @param cartellaFile cacheDir: le foto da mandare (già ridotte), i documenti da aprire.
 */
class ServizioFase6(
    trasporto: TrasportoFase5,
    val scaffale: Scaffale,
    private val esecutore: EsecutoreFase4,
    private val coda: CodaFase6,
    private val idPersonaMia: () -> String,
    private val cartellaFile: File?,
    private val dopoScrittura: () -> Unit = {},
) {
    val f = Fase6(trasporto)
    private val t = trasporto

    private suspend fun <T> leggi(lavoro: suspend Fase6.() -> T): Result<T> = esecutore.esegui { f.lavoro() }
    private suspend fun <T> scrivi(lavoro: suspend Fase6.() -> T): Result<T> = esecutore.esegui { f.lavoro() }.also { if (it.isSuccess) dopoScrittura() }

    private fun senzaRete(e: Throwable): Boolean = e !is PonteServer.Rifiutato && e !is PonteServer.AccessoScaduto && (e is IOException || e.cause is IOException || e is java.net.SocketTimeoutException)

    private fun adesso(): String = LocalDateTime.now(java.time.ZoneId.of("Europe/Rome")).withNano(0).toString()

    /**
     * Legge e tiene una copia (passata da [perDisco], che toglie quello che sul
     * telefono non deve restare); senza rete torna l'ultima copia con "_lettoAl".
     */
    private suspend fun leggiOCopia(nome: String, leggi: suspend Fase6.() -> JSONObject, perDisco: (JSONObject) -> JSONObject = { it }): Result<JSONObject> {
        val r = esecutore.esegui { f.leggi() }
        r.onSuccess { o -> scaffale.scrivi(nome, perDisco(JSONObject(o.toString())).put("_lettoAlCopia", adesso())) }
        val e = r.exceptionOrNull() ?: return r
        if (!senzaRete(e)) return r
        val copia = scaffale.leggi(nome) ?: return r
        return Result.success(JSONObject(copia.toString()).put("_lettoAl", copia.testo("_lettoAlCopia")))
    }

    // -------------------------------------------------- persone

    suspend fun organico(stato: String = "attive") = leggi { persone(stato) }

    /** La scheda: la mia resta sul telefono (§3.13); quella degli altri mai. */
    suspend fun scheda(id: String?): Result<Persona> {
        val mia = id.isNullOrBlank() || id == idPersonaMia()
        if (!mia) return leggi { persona(id) }
        return leggiOCopia("io", { personaJson(null) }).map { o -> Persona.daJson(o.optJSONObject("persona") ?: JSONObject()).copy(lettoAl = o.testo("_lettoAl")) }
    }

    suspend fun salvaPersona(o: JSONObject) = scrivi { salvaPersona(o) }
    suspend fun salvaCosto(idPersona: String, dal: LocalDate, costoOrario: Double?, costoAnno: Double?, oreAnno: Double?, nota: String) = scrivi { salvaCostoPersona(idPersona, dal, costoOrario, costoAnno, oreAnno, nota) }
    suspend fun daiAccesso(idPersona: String, email: String, ruolo: String) = scrivi { daiAccesso(idPersona, email, ruolo) }
    suspend fun salvaQualifica(o: JSONObject) = scrivi { salvaQualifica(o) }
    suspend fun qualificheTipi() = leggi { qualificheTipi() }
    suspend fun salvaQualificaTipo(tipo: JSONObject) = scrivi { salvaQualificaTipo(tipo) }
    suspend fun salvaVisita(o: JSONObject) = scrivi { salvaVisita(o) }
    suspend fun dpi(idPersona: String? = null) = leggi { dpi(idPersona) }
    suspend fun salvaConsegnaDpi(o: JSONObject, firma: ByteArray?) = scrivi { salvaConsegnaDpi(o.put("idLocale", o.testo("idLocale").ifBlank { nuovoId("D") }), firma) }
    suspend fun restituisciDpi(id: String) = scrivi { restituisciDpi(id) }
    suspend fun segnaUscita(idPersona: String, data: LocalDate, motivo: String, conferma: Boolean) = scrivi { segnaUscita(idPersona, data, motivo, conferma) }
    suspend fun accessiRiservati(idPersona: String, utente: String = "", da: String = "", a: String = "") = leggi { accessiRiservati(idPersona, utente, da, a) }
    suspend fun salvaSaldo(idPersona: String, tipo: String, data: LocalDate, ore: Double, nota: String) = scrivi { salvaSaldo(idPersona, tipo, data, ore, nota) }
    suspend fun presenze(mese: String, idPersona: String? = null) = leggi { presenze(mese, idPersona) }

    /** La firma di una consegna di DPI (anche senza rete): il PNG in coda. */
    fun firmaDpi(id: String, png: ByteArray) {
        val file = salvaFile("firma-dpi", "png", png)
        coda.firmaDpi(id, file)
    }

    // -------------------------------------------------- assenze

    /** Le assenze (le future, in corso e da approvare): restano sul telefono, quelle dei colleghi come "Assente". */
    suspend fun assenze(): Result<ElencoAssenze> = leggiOCopia("assenze", { assenzeJson() }, { PrivacyDisco.assenze(it, idPersonaMia()) }).map(ElencoAssenze::daJson)

    /** Le assenze di un periodo (il calendario): non restano sul telefono. */
    suspend fun assenzePeriodo(da: LocalDate, a: LocalDate) = leggi { ElencoAssenze.daJson(assenzeJson(listOf("da" to da.toString(), "a" to a.toString()))) }

    /** Le assenze di una persona (la sua pagina, chi approva). */
    suspend fun assenzeDi(idPersona: String) = leggi { ElencoAssenze.daJson(assenzeJson(listOf("idPersona" to idPersona, "stato" to "tutte"))) }

    /** Le assenze e le chiusure lette per ultime, senza chiedere al server (la settimana di "Il tuo giorno"). */
    fun assenzeLette(): List<Assenza> = scaffale.leggi("assenze")?.let { ElencoAssenze.daJson(it).assenze }.orEmpty()
    fun chiusureLette(): List<Chiusura> = scaffale.leggi("chiusure")?.optJSONArray("chiusure").oggetti().map(Chiusura::daJson)

    /**
     * I giorni della settimana che NON mancano (§6.5): festivi (anche il patrono), chiusure
     * dello studio e le mie assenze approvate a giornata intera, con la parola da mostrare.
     */
    fun giorniLiberi(da: LocalDate, a: LocalDate, idPersona: String, patrono: String, assenze: List<Assenza> = assenzeLette(), chiusure: List<Chiusura> = chiusureLette()): Map<LocalDate, String> {
        val out = LinkedHashMap<LocalDate, String>()
        val festivi = ContiPersone.festiviTra(da, a, patrono)
        var g = da
        while (!g.isAfter(a)) {
            val mia = assenze.firstOrNull { it.idPersona == idPersona && it.stato == "approvata" && it.copre(g) && !it.aOre && it.mezza.isBlank() }
            when {
                g in festivi -> out[g] = "festa"
                chiusure.any { it.copre(g) } -> out[g] = "chiuso"
                mia != null -> out[g] = if (mia.tipoVisto == "Ferie") "ferie" else "assente"
            }
            g = g.plusDays(1)
        }
        return out
    }

    suspend fun chiusure(): Result<List<Chiusura>> =leggiOCopia("chiusure", { chiusureJson() }).map { o -> o.optJSONArray("chiusure").oggetti().map(Chiusura::daJson) }

    /**
     * Chiedi ferie o permesso, segnala una malattia (anche senza rete): in coda col suo
     * idLocale; si vede subito fra le mie. [corpo] è l'assenza di salvaAssenza.
     */
    fun chiedi(corpo: JSONObject): String {
        val chiave = corpo.testo("idLocale").ifBlank { nuovoId("A") }
        coda.assenza(chiave, JSONObject(corpo.toString()).put("idLocale", chiave))
        return chiave
    }

    /** Per una richiesta d'altri (chi approva, persone 2) si scrive in diretta: c'è l'esito con le anomalie. */
    suspend fun salvaAssenza(corpo: JSONObject) = scrivi { salvaAssenza(corpo.put("idLocale", corpo.testo("idLocale").ifBlank { nuovoId("A") })) }

    /**
     * Annulla: una richiesta ancora in coda esce dalla coda; una mia già arrivata va in
     * coda (parte da sola); quella di un altro (chi approva, col motivo) in diretta.
     */
    suspend fun annulla(a: Assenza, motivo: String = "", mia: Boolean = true): Result<Unit> {
        if (a.inCoda && a.id.isBlank()) {
            coda.togliAssenzaInCoda(a.idLocale)
            return Result.success(Unit)
        }
        if (mia) {
            coda.annullaAssenza(a.id, JSONObject().apply { if (motivo.isNotBlank()) put("motivo", motivo) })
            return Result.success(Unit)
        }
        return scrivi { annullaAssenza(a.id, motivo); Unit }
    }

    // -------------------------------------------------- mezzi

    /** I mezzi (restano sul telefono: sono dati di lavoro). */
    suspend fun mezzi(): Result<List<Mezzo>> = leggiOCopia("mezzi", { mezziJson() }).map { o -> o.optJSONArray("mezzi").oggetti().map(Mezzo::daJson).map { it.copy(lettoAl = o.testo("_lettoAl")) } }

    /** Un mezzo: quello che ho io resta sul telefono (§3.13), gli altri no. */
    suspend fun mezzo(id: String, mio: Boolean): Result<Mezzo> {
        val r = if (mio) leggiOCopia("mezzo-$id", { mezzoJson(id) }) else leggi { mezzoJson(id) }
        return r.map { o -> Mezzo.daJson(o.optJSONObject("mezzo") ?: throw PonteServer.Rifiutato("Il server non ha restituito il mezzo")).copy(lettoAl = o.testo("_lettoAl")) }
    }

    suspend fun salvaMezzo(o: JSONObject) = scrivi { salvaMezzo(o) }
    suspend fun costiMezzo(id: String) = leggi { costiMezzo(id) }
    suspend fun chiudiGuasto(id: String, esito: String) = scrivi { chiudiManutenzione(id, esito) }
    suspend fun manutenzioni(aperte: Boolean = false) = leggi { manutenzioni(aperte) }

    /** Segna i km (anche senza rete), con la foto del contachilometri: in coda, partono da soli. */
    fun segnaKm(idVeicolo: String, km: Long, data: LocalDate, foto: File?, conferma: Boolean): String {
        val chiave = nuovoId("K")
        val c = JSONObject().put("idVeicolo", PonteServer.idJson(idVeicolo)).put("km", km).put("data", data.toString())
        if (conferma) c.put("conferma", true)
        coda.km(chiave, c)
        if (foto != null) coda.fotoKm(chiave, foto)
        return chiave
    }

    /** Segnala un guasto (anche senza rete), con le foto: in coda, parte da solo. */
    fun segnalaGuasto(idVeicolo: String?, idAttrezzatura: String?, titolo: String, fermo: Boolean, km: Long?, data: LocalDate, foto: List<File>): String {
        val chiave = nuovoId("G")
        val c = JSONObject().put("titolo", titolo.trim()).put("fermo", fermo).put("data", data.toString())
        if (!idVeicolo.isNullOrBlank()) c.put("idVeicolo", PonteServer.idJson(idVeicolo))
        if (!idAttrezzatura.isNullOrBlank()) c.put("idAttrezzatura", PonteServer.idJson(idAttrezzatura))
        km?.let { c.put("km", it) }
        coda.guasto(chiave, c)
        foto.forEach { coda.fotoGuasto(chiave, it) }
        return chiave
    }

    // -------------------------------------------------- attrezzature

    /** Il catalogo (resta sul telefono: serve ad "Altro strumento" nel rapportino anche senza rete). */
    suspend fun attrezzature(): Result<List<Attrezzatura>> =
        leggiOCopia("attrezzature", { attrezzatureJson() }).map { o -> o.optJSONArray("attrezzature").oggetti().map(Attrezzatura::daJson).map { it.copy(lettoAl = o.testo("_lettoAl")) } }

    /** Il catalogo letto per ultimo, senza chiedere al server (il rapportino senza rete). */
    fun attrezzatureLette(): List<Attrezzatura> = scaffale.leggi("attrezzature")?.optJSONArray("attrezzature").oggetti().map(Attrezzatura::daJson)

    suspend fun attrezzatura(id: String) = leggi { attrezzatura(id) }
    suspend fun salvaAttrezzatura(o: JSONObject) = scrivi { salvaAttrezzatura(o) }
    suspend fun registraTaratura(o: JSONObject) = scrivi { registraTaratura(o) }
    suspend fun assegnazioni(inCorso: Boolean = false) = leggi { assegnazioni(if (inCorso) listOf("inCorso" to "1") else emptyList()) }

    /** I mezzi e gli strumenti in prestito a una commessa, ancora fuori (§12.8). */
    suspend fun assegnazioniCommessa(idCommessa: String) = leggi { assegnazioni(listOf("inCorso" to "1", "idCommessa" to idCommessa)) }

    /** Lo prendo io (anche senza rete): un prestito a me, in coda. */
    fun prendi(idAttrezzatura: String?, idVeicolo: String?) {
        val c = JSONObject().put("tipo", "prestito")
        idPersonaMia().takeIf { it.isNotBlank() }?.let { c.put("idPersona", PonteServer.idJson(it)) }
        if (!idAttrezzatura.isNullOrBlank()) c.put("idAttrezzatura", PonteServer.idJson(idAttrezzatura))
        if (!idVeicolo.isNullOrBlank()) c.put("idVeicolo", PonteServer.idJson(idVeicolo))
        coda.prestito(nuovoId("P"), c)
    }

    /** Restituisci (anche senza rete), in coda. */
    fun restituisci(idAttrezzatura: String?, idVeicolo: String?) {
        val c = JSONObject()
        if (!idAttrezzatura.isNullOrBlank()) c.put("idAttrezzatura", PonteServer.idJson(idAttrezzatura))
        if (!idVeicolo.isNullOrBlank()) c.put("idVeicolo", PonteServer.idJson(idVeicolo))
        coda.restituisci(nuovoId("R"), c)
    }

    /** Assegna o presta (mezzi 2): in diretta. */
    suspend fun assegna(o: JSONObject) = scrivi { assegna(o) }

    // -------------------------------------------------- collaboratori

    suspend fun collaboratori() = leggi { collaboratori() }

    /** La scheda del collaboratore; quella dell'esterno (senza id) resta sul suo telefono. */
    suspend fun collaboratore(id: String?, mia: Boolean = false): Result<Collaboratore> {
        val r = if (mia) leggiOCopia("collaboratore-io", { collaboratoreJson(null) }) else leggi { collaboratoreJson(id) }
        return r.map { o -> Collaboratore.daJson(o.optJSONObject("collaboratore") ?: throw PonteServer.Rifiutato("Il server non ha restituito il collaboratore")) }
    }

    suspend fun salvaCollaboratore(o: JSONObject) = scrivi { salvaCollaboratore(o) }
    suspend fun invitaEsterno(idSoggetto: String, nome: String, email: String) = scrivi { invitaEsterno(idSoggetto, nome, email) }

    /** Gli incarichi; quelli dell'esterno restano sul suo telefono (§3.13). */
    suspend fun incarichi(stato: String = "tutti", mieiDiEsterno: Boolean = false): Result<List<Incarico>> {
        val r = if (mieiDiEsterno) leggiOCopia("incarichi", { incarichiJson(stato) }) else leggi { incarichiJson(stato) }
        return r.map { o -> o.optJSONArray("incarichi").oggetti().map(Incarico::daJson) }
    }

    suspend fun incarico(id: String) = leggi { incarico(id) }
    suspend fun incarichiCommessa(idCommessa: String) = leggi { incarichiJson("tutti", idCommessa = idCommessa).optJSONArray("incarichi").oggetti().map(Incarico::daJson) }
    suspend fun costiEsterni(idCommessa: String) = leggi { costiEsterni(idCommessa) }
    suspend fun salvaIncarico(o: JSONObject) = scrivi { salvaIncarico(o) }
    suspend fun azioneIncarico(azione: String, id: String, campi: JSONObject = JSONObject()) = scrivi { azioneIncarico(azione, id, campi) }
    suspend fun oreCollaboratore(i: Incarico, data: LocalDate, ore: Double, descrizione: String) = scrivi { oreCollaboratore(i, data, ore, descrizione) }
    suspend fun compensi(anno: Int? = null) = leggi { compensi(anno) }

    // -------------------------------------------------- file

    /** Una foto (già ridotta) o una firma in cacheDir/fase6, da mandare con la coda. */
    fun salvaFile(prefisso: String, estensione: String, dati: ByteArray): File {
        val d = File(cartellaFile ?: File(System.getProperty("java.io.tmpdir") ?: "."), "fase6").apply { mkdirs() }
        return File(d, "$prefisso-" + UUID.randomUUID().toString().replace("-", "").take(16) + ".$estensione").apply { writeBytes(dati) }
    }

    /**
     * Un documento personale da aprire: si scarica in cacheDir/pdf col prefisso
     * "riservato-" (non fra i documenti recenti, che restano sul telefono) e i file così
     * si tolgono all'uscita dall'account ([togliRiservati]).
     */
    suspend fun fileDaAprire(idFile: String, nome: String): Result<File> = esecutore.esegui {
        val pdf = File(cartellaFile ?: throw PonteServer.Rifiutato("Il file qui non si apre"), "pdf").apply { mkdirs() }
        val (byte, _) = try {
            t.file(idFile)
        } catch (e: IOException) {
            throw PonteServer.Rifiutato("Si apre quando c'è rete")
        }
        File(pdf, "riservato-" + nome.replace(Regex("""[\\/:*?"<>|]"""), "_").ifBlank { "documento" }).apply { writeBytes(byte) }
    }

    /** All'uscita dall'account: via le copie della fase 6, i documenti personali aperti, le foto già partite. */
    fun togliRiservati() {
        scaffale.svuota()
        cartellaFile?.let { c -> File(c, "pdf").listFiles()?.filter { it.name.startsWith("riservato-") }?.forEach { it.delete() } }
    }

    companion object {
        fun nuovoId(lettera: String): String = "$lettera-" + UUID.randomUUID().toString().replace("-", "").take(16)

        fun lista(l: List<JSONObject>): JSONArray = JSONArray().apply { l.forEach { put(it) } }
    }
}
