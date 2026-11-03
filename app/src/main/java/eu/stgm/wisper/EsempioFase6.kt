package eu.stgm.wisper

import eu.stgm.wisper.rapportino.PonteServer
import eu.stgm.wisper.rapportino.TrasportoFase5
import org.json.JSONArray
import org.json.JSONObject
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.temporal.TemporalAdjusters

/**
 * Persone, mezzi e collaboratori della visita guidata: un server finto in memoria
 * che risponde come quello vero (architettura.md §17), coi nomi di esempio di sempre.
 * Chi fa la visita è Manuel (persona 1): ha il Doblò e il multimetro scaduto, così
 * "Il mio" e "I tuoi strumenti" si vedono. Scrivere dice che è un esempio.
 */
class EsempioFase6(private val oggi: LocalDate = LocalDate.now()) : TrasportoFase5 {

    private val esempio = "Nella visita guidata è un esempio: qui non si salva niente"
    private fun d(giorni: Long) = oggi.plusDays(giorni).toString()
    private val it = DateTimeFormatter.ofPattern("dd/MM/yyyy")
    private fun arr(vararg o: JSONObject) = JSONArray().apply { o.forEach { put(it) } }
    private fun arr(l: List<JSONObject>) = JSONArray().apply { l.forEach { put(it) } }

    /** Il lunedì della settimana dopo la prossima: le ferie di Marco da approvare. */
    private val lunediFerie = oggi.with(TemporalAdjusters.next(DayOfWeek.MONDAY)).plusWeeks(1)
    private val prossimoLavorativo = generateSequence(oggi.plusDays(1)) { it.plusDays(1) }.first { it.dayOfWeek.value <= 5 }

    private fun assenteOggi(tipo: String) = JSONObject().put("dal", oggi.toString()).put("al", prossimoLavorativo.toString()).put("tipoVisto", tipo)

    private fun riga(id: Int, nome: String, rapporto: String, ruolo: String, tel: String, idUtente: Int?, ruoloW: String, costo: Double?, assente: Boolean = false) =
        JSONObject().put("id", id).put("nome", nome).put("rapporto", rapporto).put("rapportoNome", eu.stgm.wisper.rapportino.ParolePersone.rapporto(rapporto))
            .put("ruoloStudio", ruolo).put("telefonoLavoro", tel).put("emailLavoro", "").put("idUtente", idUtente ?: JSONObject.NULL).put("ruoloWisper", ruoloW)
            .put("accessoAttivo", idUtente != null).put("assenteOggi", if (assente) assenteOggi("Ferie") else JSONObject.NULL).put("daCompletare", false)
            .put("scadenzeVicine", if (id == 3) 1 else 0).put("scadute", if (id == 3) 1 else 0).put("costoOrario", costo ?: JSONObject.NULL).put("costoDal", if (costo != null) "${oggi.year}-01-01" else "")

    private val organico = listOf(
        riga(1, "Manuel Gasparotto", "titolare", "Titolare", "0445 000300", 1, "titolare", null),
        riga(2, "Laura Bianchi", "dipendente", "Amministrazione", "0445 000302", 2, "amministrazione", 22.4, assente = true),
        riga(3, "Marco Rossato", "dipendente", "Tecnico elettrico", "0445 000301", 3, "collaboratore", 28.5),
        riga(5, "Elena Costa", "tirocinante", "Tirocinio tecnico", "", null, "", null),
    )

    private fun assenza(id: Int, idPersona: Int, persona: String, tipo: String, dal: LocalDate, al: LocalDate, giorni: Double, ore: Double, stato: String, nota: String = "") =
        JSONObject().put("id", id).put("idLocale", "").put("idPersona", idPersona).put("persona", persona).put("tipo", tipo)
            .put("tipoVisto", eu.stgm.wisper.rapportino.ParolePersone.TIPI[tipo]).put("causale", "").put("dal", dal.toString()).put("al", al.toString())
            .put("mezza", "").put("dalle", "").put("alle", "").put("giorni", giorni).put("ore", ore).put("stato", stato)
            .put("statoVisto", eu.stgm.wisper.rapportino.ParolePersone.STATI[stato]).put("nota", nota).put("protocollo", "").put("approvataDaNome", if (stato == "approvata") "Manuel Gasparotto" else "")
            .put("motivoRifiuto", "").put("chiusura", "").put("daApprovare", stato == "da_approvare").put("puoScrivere", true).put("puoAnnullare", true)

    private val assenze = listOf(
        assenza(2, 2, "Laura Bianchi", "ferie", oggi, prossimoLavorativo, 2.0, 12.0, "approvata"),
        assenza(1, 3, "Marco Rossato", "ferie", lunediFerie, lunediFerie.plusDays(4), 5.0, 40.0, "da_approvare", "Matrimonio di mio fratello"),
    )

    private fun saldi(ferie: Double, prenotate: Double) = JSONObject()
        .put("ferie", JSONObject().put("tenuto", true).put("scritto", ferie).put("scrittoIl", oggi.withDayOfMonth(1).minusDays(1).toString()).put("maturate", 0).put("godute", 0)
            .put("oggi", ferie).put("prenotate", prenotate).put("restano", ferie - prenotate).put("oreGiorno", 8).put("giorniOggi", ferie / 8).put("giorniRestano", (ferie - prenotate) / 8))
        .put("permessi", JSONObject().put("tenuto", true).put("scritto", 24).put("scrittoIl", oggi.withDayOfMonth(1).minusDays(1).toString()).put("maturate", 0).put("godute", 0)
            .put("oggi", 24).put("prenotate", 0).put("restano", 24).put("oreGiorno", 8))

    private fun inUso(tipo: String, id: Int, codice: String, nome: String, cat: String, taratura: String) =
        JSONObject().put("tipo", tipo).put("id", id).put("codice", codice).put("nome", nome).put("categoria", cat).put("come", "assegnato").put("dal", d(-30)).put("rientro", "").put("taratura", taratura)

    private fun scheda(id: Int): JSONObject {
        val base = JSONObject(organico.first { it.optInt("id") == id }.toString())
        base.put("mansione", if (id == 3) "Lavori elettrici fuori tensione e in prossimità; verifiche" else if (id == 1) "Direzione tecnica, progettazione e verifiche" else "Lavoro d'ufficio")
            .put("entrataIl", when (id) { 1 -> "2008-01-01"; 2 -> "2024-03-01"; 3 -> "2023-05-02"; else -> d(-40) })
            .put("uscitaIl", "").put("oreSettimana", if (id == 2) 30 else 40).put("giorniSettimana", JSONArray(listOf(1, 2, 3, 4, 5))).put("oreGiorno", if (id == 2) 6 else 8)
            .put("partTime", id == 2).put("ultimoAccesso", oggi.atTime(8, 12).toString() + ":00").put("anonimizzata", false)
            .put("codiceFiscale", if (id == 3) "RSSMRC90A01L157X" else "").put("indirizzo", "Via dell'Esempio ${10 + id}").put("cap", "36016").put("citta", "Thiene").put("provincia", "VI")
            .put("telefonoPersonale", "333 000030$id").put("emailPersonale", "").put("iban", "IT60X0542811101000000123456").put("emergenzaNome", if (id == 3) "Giulia Rossato" else "")
            .put("emergenzaTelefono", if (id == 3) "333 0000302" else "").put("contrattoTipo", if (id == 5) "stage" else "indeterminato").put("contrattoScade", if (id == 5) d(50) else "")
            .put("motivoUscita", "").put("ferieAnnueOre", if (id == 1 || id == 5) JSONObject.NULL else 208).put("permessiAnnuiOre", if (id == 1 || id == 5) JSONObject.NULL else 72)
            .put("ccnl", if (id == 1) "" else "Studi professionali").put("livello", if (id == 1) "" else "3").put("noteRiservate", "")
            .put("mezzi", if (id == 1) arr(JSONObject().put("tipo", "mezzo").put("id", 2).put("nome", "Fiat Doblò GA123BC").put("come", "assegnato").put("dal", d(-60)).put("rientro", "")) else JSONArray())
            .put("attrezzature", if (id == 1) arr(inUso("attrezzatura", 4, "AT004", "Multimetro 87V", "strumento", "Taratura scaduta da 10 giorni"), inUso("attrezzatura", 1, "AT001", "Misuratore di terra MT-500", "strumento", "Taratura fra 24 giorni")) else JSONArray())
            .put("qualifiche", arr(
                JSONObject().put("id", 1).put("tipo", "pes").put("nome", "PES · Persona esperta (CEI 11-27)").put("titolo", "Livelli 1A e 1B, 16 ore").put("data", "2024-02-12").put("scade", "2029-02-12")
                    .put("statoVisto", "Valida").put("statoDettaglio", "fino al 12/02/2029"),
                JSONObject().put("id", 2).put("tipo", "primo_soccorso").put("nome", "Primo soccorso").put("titolo", "Gruppo B, 12 ore").put("data", oggi.minusYears(3).minusDays(32).toString())
                    .put("scade", oggi.minusDays(32).toString()).put("statoVisto", "Scaduta").put("statoDettaglio", "da 32 giorni"),
            ))
            .put("visite", arr(JSONObject().put("id", 1).put("data", oggi.minusYears(1).plusDays(13).toString()).put("tipo", "periodica").put("giudizio", "idoneo").put("giudizioVisto", "Idoneo")
                .put("prescrizioni", "").put("validoFino", "").put("prossima", d(13)).put("medico", "Medico competente di esempio")
                .put("riga", "Visita del " + oggi.minusYears(1).plusDays(13).format(it) + " · prossima il " + oggi.plusDays(13).format(it))))
            .put("prossimaVisita", d(13))
            .put("dpi", arr(JSONObject().put("id", 2).put("cosa", "Elmetto con visiera").put("taglia", "unica").put("quantita", 1).put("data", d(-2)).put("firmata", false).put("daFirmare", true)))
            .put("saldi", if (id == 1 || id == 5) JSONObject().put("ferie", JSONObject().put("tenuto", false)).put("permessi", JSONObject().put("tenuto", false)) else saldi(104.0, if (id == 3) 40.0 else 0.0))
            .put("assenze", arr(assenze.filter { a -> a.optInt("idPersona") == id }))
            .put("scadenze", JSONArray()).put("documenti", JSONArray())
            .put("costi", JSONArray()).put("costoAnno", JSONObject.NULL).put("oreAnno", JSONObject.NULL).put("notaCosto", "")
            .put("puoScrivere", true).put("puoCambiareContatti", id == 1).put("puoVedereRiservati", true).put("puoApprovare", true).put("daCompletare", JSONArray()).put("programmaPaghe", "non collegato")
        return base
    }

    private fun taratura(stato: String, parola: String, giorni: Int?, scade: String) = JSONObject().put("stato", stato).put("parola", parola).put("giorni", giorni ?: JSONObject.NULL).put("scade", scade)
    private fun chi(idPersona: Int, nome: String, tipo: String = "assegnato") = JSONObject().put("idAssegnazione", 1).put("tipo", tipo).put("idPersona", idPersona).put("idCommessa", "").put("idSoggetto", "").put("nome", nome).put("dal", d(-30)).put("rientro", "")

    private val strumenti = listOf(
        JSONObject().put("id", 4).put("codice", "AT004").put("nome", "Multimetro 87V").put("categoria", "strumento").put("categoriaNome", "Strumenti di misura").put("marca", "Esempio Strumenti").put("modello", "87V")
            .put("matricola", "6011-2381").put("statoVisto", "Taratura scaduta").put("stato", "scaduta").put("chi", chi(1, "Manuel Gasparotto")).put("posizione", "").put("controllo", "taratura")
            .put("taratura", taratura("scaduta", "Taratura scaduta da 10 giorni", 10, d(-10))).put("mio", true).put("dismesso", false),
        JSONObject().put("id", 1).put("codice", "AT001").put("nome", "Misuratore di terra MT-500").put("categoria", "strumento").put("categoriaNome", "Strumenti di misura").put("marca", "Esempio Strumenti").put("modello", "MT-500")
            .put("matricola", "22-0451").put("statoVisto", "Assegnato a Manuel Gasparotto").put("stato", "assegnato").put("chi", chi(1, "Manuel Gasparotto")).put("posizione", "Armadio dell'ufficio").put("controllo", "taratura")
            .put("taratura", taratura("in_scadenza", "Taratura fra 24 giorni", 24, d(24))).put("mio", true).put("dismesso", false),
        JSONObject().put("id", 2).put("codice", "AT002").put("nome", "Analizzatore di rete AR-6").put("categoria", "strumento").put("categoriaNome", "Strumenti di misura").put("marca", "Esempio Strumenti").put("modello", "AR-6")
            .put("matricola", "AR6-0099").put("statoVisto", "In taratura").put("stato", "laboratorio").put("chi", JSONObject.NULL).put("rientro", d(7)).put("posizione", "").put("controllo", "taratura")
            .put("taratura", taratura("laboratorio", "In taratura", null, d(3))).put("mio", false).put("dismesso", false),
        JSONObject().put("id", 3).put("codice", "AT003").put("nome", "Pinza amperometrica").put("categoria", "strumento").put("categoriaNome", "Strumenti di misura").put("marca", "").put("modello", "")
            .put("matricola", "PA-310").put("statoVisto", "Disponibile").put("stato", "disponibile").put("chi", JSONObject.NULL).put("posizione", "Armadio dell'ufficio").put("controllo", "taratura")
            .put("taratura", taratura("senza", "Taratura non scritta", null, "")).put("mio", false).put("dismesso", false),
        JSONObject().put("id", 5).put("codice", "AT005").put("nome", "Guanti isolanti classe 0").put("categoria", "dpi").put("categoriaNome", "DPI").put("marca", "").put("modello", "")
            .put("matricola", "G0-112").put("statoVisto", "Assegnato a Marco Rossato").put("stato", "assegnato").put("chi", chi(3, "Marco Rossato")).put("posizione", "").put("controllo", "verifica")
            .put("taratura", taratura("valida", "Verificato fino al " + oggi.plusDays(70).format(it), 70, d(70))).put("mio", false).put("dismesso", false),
    )

    private val doblo = JSONObject().put("id", 2).put("nome", "Fiat Doblò").put("targa", "GA123BC").put("titolo", "Fiat Doblò GA123BC").put("tipo", "furgone").put("proprieta", "studio")
        .put("proprietaVista", "Dello studio").put("idPersona", JSONObject.NULL).put("statoVisto", "Assegnato a Manuel Gasparotto").put("stato", "assegnato").put("motivoFermo", "")
        .put("chi", chi(1, "Manuel Gasparotto")).put("km", 84320).put("kmIl", d(-4)).put("kmAlTagliando", 5680)
        .put("prossimaScadenza", JSONObject().put("id", 17).put("tipo", "assicurazione").put("data", d(14)).put("statoVisto", "Scade fra 14 giorni"))
        .put("guastiAperti", 1).put("fermo", false).put("mio", true).put("attivo", true).put("euroKm", JSONObject.NULL)

    private val volvo = JSONObject().put("id", 1).put("nome", "Volvo XC40").put("targa", "").put("titolo", "Volvo XC40").put("tipo", "auto").put("proprieta", "persona")
        .put("proprietaVista", "Auto di Manuel Gasparotto").put("idPersona", 1).put("statoVisto", "Auto di Manuel Gasparotto").put("stato", "persona").put("motivoFermo", "")
        .put("chi", JSONObject().put("idPersona", 1).put("nome", "Manuel Gasparotto").put("tipo", "sua")).put("km", JSONObject.NULL).put("kmIl", "").put("kmAlTagliando", JSONObject.NULL)
        .put("prossimaScadenza", JSONObject.NULL).put("guastiAperti", 0).put("fermo", false).put("mio", false).put("attivo", true).put("euroKm", 0.76)

    private fun scadenzaMezzo(id: Int, tipo: String, titolo: String, data: String, statoVisto: String) = JSONObject().put("id", id).put("titolo", titolo).put("tipo", tipo)
        .put("tipoNome", tipo.replaceFirstChar { it.uppercase() }).put("data", data).put("stato", "aperta").put("statoVisto", statoVisto).put("statoDettaglio", "").put("gruppo", "mezzi")

    private fun schedaDoblo() = JSONObject(doblo.toString()).put("immatricolazione", "2023-03-15").put("alimentazione", "gasolio").put("note", "Le chiavi di scorta sono nell'armadio dell'ufficio")
        .put("scadenze", arr(scadenzaMezzo(17, "assicurazione", "Assicurazione Fiat Doblò GA123BC", d(14), "Scade fra 14 giorni"), scadenzaMezzo(18, "bollo", "Bollo Fiat Doblò GA123BC", d(120), "Prossima"),
            scadenzaMezzo(19, "revisione", "Revisione Fiat Doblò GA123BC", "2027-03-31", "Prossima")))
        .put("letture", arr(JSONObject().put("id", 2).put("data", d(-4)).put("km", 84320).put("origine", "mano").put("utente", "Manuel Gasparotto"),
            JSONObject().put("id", 1).put("data", "${oggi.year - 1}-12-31").put("km", 65920).put("origine", "mano").put("utente", "Manuel Gasparotto")))
        .put("manutenzioni", arr(JSONObject().put("id", 1).put("idVeicolo", 2).put("tipo", "guasto").put("stato", "aperta").put("statoVisto", "Segnalato").put("fermo", false).put("data", d(-2))
            .put("km", 84300).put("titolo", "Spia della pressione delle gomme accesa").put("descrizione", "Si accende dopo qualche km").put("segnalataDaNome", "Marco Rossato").put("foto", JSONArray())))
        .put("assegnazioni", arr(JSONObject().put("id", 1).put("tipo", "assegnato").put("tipoVisto", "Assegnato").put("chi", "Manuel Gasparotto").put("dal", d(-60)).put("al", "").put("inCorso", true)))
        .put("documenti", JSONArray()).put("puoScrivere", true).put("puoSegnareKm", true).put("puoPrendere", false)
        .put("costi", JSONObject().put("anno", oggi.year).put("km", JSONObject().put("anno", 18400)).put("voci", arr(JSONObject().put("nome", "Carburante").put("importo", 1240.6).put("quante", 31),
            JSONObject().put("nome", "Assicurazione").put("importo", 612).put("quante", 1))).put("totale", 1852.6).put("euroKm", 0.1))

    private val collaboratore = JSONObject().put("idSoggetto", "F006").put("nome", "Impianti Veneti di Sartori Luca").put("tipo", "impresa").put("tipoNome", "Impresa")
        .put("mestiere", "Impianti elettrici civili e industriali").put("attivo", true).put("idoneita", JSONObject().put("stato", "in_regola").put("parola", "In regola").put("frase", ""))
        .put("incarichiInCorso", 1).put("valutazioni", JSONObject().put("bene", 1).put("problemi", 0).put("male", 0)).put("daFatturare", 720)

    private val incarico = JSONObject().put("id", 1).put("numero", "IN/${oggi.year}/001").put("idSoggetto", "F006").put("collaboratore", "Impianti Veneti di Sartori Luca").put("idCommessa", "26ST044")
        .put("commessa", "Quadri della linea 3").put("cliente", "Elettrodinamica").put("titolo", "Cablaggio quadri di linea 4 e 5").put("modo", "corpo").put("modoVisto", "A corpo")
        .put("stato", "affidato").put("statoVisto", "Affidato").put("avanzamento", 60).put("dal", d(-20)).put("al", d(30)).put("speseComprese", true).put("referente", "Manuel Gasparotto")
        .put("compenso", 3200).put("conti", JSONObject().put("pattuito", 3200).put("maturato", 1920).put("fatturato", 1200).put("costo", 1200).put("daFatturare", 720).put("daPagare", 1464))

    override suspend fun leggiAzione(azione: String, parametri: List<Pair<String, String>>): JSONObject {
        val p = parametri.toMap()
        val ok = JSONObject().put("ok", true)
        return when (azione) {
            "persone" -> ok.put("persone", arr(organico)).put("conteggi", JSONObject().put("attive", 4).put("senzaAccesso", 1).put("assentiOggi", 1).put("daCompletare", 0))
            "persona" -> ok.put("persona", scheda(p["id"]?.toIntOrNull() ?: 1))
            "assenze" -> ok.put("oggi", oggi.toString()).put("assenze", arr(assenze)).put("chiusure", JSONArray()).put("festivi", JSONArray())
            "chiusure" -> ok.put("chiusure", arr(JSONObject().put("id", 1).put("nome", "Natale").put("dal", "${oggi.year}-12-24").put("al", "${oggi.year + 1}-01-06").put("ferie", true).put("frase", "Studio chiuso: Natale")))
            "presenze" -> ok.put("mese", p["mese"].orEmpty()).put("persone", arr(listOf(1 to "Manuel Gasparotto", 3 to "Marco Rossato").map { (id, nome) ->
                JSONObject().put("idPersona", id).put("nome", nome).put("oreGiorno", 8).put("giorni", JSONArray()).put("totali", JSONObject().put("giorniLavorati", 15).put("oreLavorate", 124).put("straordinarie", 4)
                    .put("ferie", 0).put("permessi", 0).put("altreAssenze", 0).put("mancano", if (id == 3) 2 else 0))
            })).put("programmaPaghe", "non collegato")
            "saldi" -> ok.put("saldi", saldi(104.0, 40.0))
            "mezzi" -> ok.put("mezzi", arr(doblo, volvo)).put("conteggi", JSONObject().put("mezzi", 2).put("fermi", 0).put("guastiAperti", 1).put("scadenzeVicine", 1))
            "mezzo" -> ok.put("mezzo", if (p["id"] == "1") JSONObject(volvo.toString()).put("scadenze", JSONArray()).put("letture", JSONArray()).put("manutenzioni", JSONArray()).put("assegnazioni", JSONArray()) else schedaDoblo())
            "costiMezzo" -> schedaDoblo().getJSONObject("costi").put("ok", true)
            "attrezzature" -> ok.put("attrezzature", arr(strumenti))
            "attrezzatura" -> ok.put("attrezzatura", JSONObject((strumenti.firstOrNull { it.optString("id") == p["id"] } ?: strumenti.first()).toString())
                .put("controlloOgniMesi", 12).put("laboratorio", "Laboratorio Tarature Nord Srl").put("fuoriUso", "")
                .put("tarature", arr(JSONObject().put("id", 3).put("data", d(-375)).put("scade", d(-10)).put("esito", "conforme").put("esitoVisto", "Conforme")
                    .put("laboratorio", "Laboratorio Tarature Nord Srl").put("certificato", "LAT 0777/24").put("frase", "Tarato il " + oggi.minusDays(375).format(it) + " da Laboratorio Tarature Nord Srl · certificato LAT 0777/24 · fino al " + oggi.minusDays(10).format(it))))
                .put("assegnazioni", JSONArray()).put("manutenzioni", JSONArray()).put("documenti", JSONArray()).put("usi", JSONArray()).put("usiDaControllare", JSONArray()).put("puoScrivere", true).put("puoPrendere", false))
            "assegnazioni" -> ok.put("assegnazioni", arr(JSONObject().put("id", 6).put("idAttrezzatura", 6).put("oggetto", "Imbracatura anticaduta AT006").put("tipo", "prestito").put("tipoVisto", "In prestito")
                .put("chi", "Impianti Veneti di Sartori Luca").put("dal", d(-8)).put("rientro", d(-1)).put("al", "").put("inCorso", true).put("inRitardo", true)))
            "manutenzioni" -> ok.put("manutenzioni", schedaDoblo().getJSONArray("manutenzioni"))
            "dpi" -> ok.put("consegne", scheda(3).getJSONArray("dpi"))
            "accessiRiservati" -> ok.put("righe", JSONArray())
            "qualificheTipi" -> ok.put("tipi", JSONArray())
            "collaboratori" -> ok.put("collaboratori", arr(collaboratore))
            "collaboratore" -> ok.put("collaboratore", JSONObject(collaboratore.toString()).put("abilitazioni", "DM 37/2008, lettere A e B").put("referente", "Manuel Gasparotto")
                .put("partitaIva", "05556667771").put("telefono", "0445 000401").put("email", "info@impiantiveneti.example").put("citta", "Thiene")
                .put("idoneita", JSONObject().put("stato", "in_regola").put("parola", "In regola").put("frase", "").put("prossima", JSONObject().put("nome", "DURC").put("data", d(7)).put("giorni", 7)))
                .put("documenti", arr(JSONObject().put("id", 15).put("titolo", "DURC").put("tipoScadenza", "durc").put("tipoNome", "DURC").put("data", d(-113)).put("scade", d(7)).put("statoVisto", "Scade fra 7 giorni")))
                .put("incarichi", JSONObject().put("inCorso", 1).put("conclusi", 1).put("daValutare", 0)).put("elencoIncarichi", arr(incarico))
                .put("accessi", arr(JSONObject().put("idUtente", 6).put("nome", "Luca Sartori").put("email", "luca@esempio.it").put("ultimoAccesso", d(-1) + "T17:40:00").put("attivo", true)))
                .put("tariffa", 32).put("compensi", JSONObject(incarico.getJSONObject("conti").toString())).put("programmaDurc", "non collegato").put("puoScrivere", true).put("puoAffidare", true))
            "incarichi" -> ok.put("incarichi", arr(incarico))
            "incarico" -> ok.put("incarico", JSONObject(incarico.toString()).put("descrizione", "Posa e cablaggio dei quadri secondo gli schemi dello studio")
                .put("idoneita", JSONObject().put("stato", "in_regola").put("parola", "In regola")).put("ricevute", arr(JSONObject().put("id", 5).put("numero", "18/${oggi.year}").put("data", d(-5)).put("imponibile", 1200).put("statoPagamento", "Da pagare")))
                .put("ore", JSONArray()).put("cronologia", JSONArray()).put("collaboratoreHaAccesso", true).put("puoScrivere", true))
            "compensi" -> ok.put("anno", oggi.year).put("righe", arr(JSONObject(incarico.getJSONObject("conti").toString()).put("idSoggetto", "F006").put("nome", "Impianti Veneti di Sartori Luca").put("incarichi", 1)))
                .put("totale", JSONObject(incarico.getJSONObject("conti").toString()).put("incarichi", 1))
            else -> throw PonteServer.Rifiutato(esempio)
        }
    }

    override suspend fun scriviAzione(corpo: JSONObject): JSONObject = throw PonteServer.Rifiutato(esempio)
    override suspend fun file(id: String): Pair<ByteArray, String> = throw PonteServer.Rifiutato(esempio)
    override suspend fun carica(nome: String, mime: String, idFile: String, per: String, dati: ByteArray): JSONObject = throw PonteServer.Rifiutato(esempio)
}
