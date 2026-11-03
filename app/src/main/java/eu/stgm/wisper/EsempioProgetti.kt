package eu.stgm.wisper

import eu.stgm.wisper.rapportino.Anagrafiche
import eu.stgm.wisper.rapportino.CodiciProgetto
import eu.stgm.wisper.rapportino.PonteServer
import eu.stgm.wisper.rapportino.Progetto
import eu.stgm.wisper.rapportino.Rapportino
import eu.stgm.wisper.rapportino.TrasportoFase5
import eu.stgm.wisper.rapportino.testo
import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate
import java.time.LocalDateTime

/**
 * I progetti della visita guidata (03/11/2026, progetti.md): un server finto in memoria che risponde come
 * server/src/azioni/progetti.js, con le stesse frasi quando dice di no. I progetti stanno nelle anagrafiche di
 * esempio (come sul telefono vero), cosi' il rapportino li vede subito. Solo dati di esempio.
 */
class EsempioProgetti(
    private val oggi: LocalDate,
    private val leggi: () -> Anagrafiche,
    private val scrivi: (Anagrafiche) -> Unit,
    private val rapportini: () -> List<Rapportino>,
) : TrasportoFase5 {

    private fun progetti() = leggi().progetti
    private fun arr(l: List<JSONObject>) = JSONArray().apply { l.forEach { put(it) } }
    private fun no(frase: String): Nothing = throw PonteServer.Rifiutato(frase)

    private fun conConti(p: Progetto): Progetto {
        val r = rapportini().filter { it.idProgetto == p.id }
        return p.copy(rapportini = r.size, ore = r.sumOf { it.oreLavoro }, ultimoRapportino = r.maxOfOrNull { it.data }?.toString() ?: "")
    }

    private fun proposta(idCommessa: String, idCliente: String) =
        CodiciProgetto.proponi(progetti().map { it.perCodice() }, idCommessa, idCliente, oggi.year)

    private fun giaPreso(codice: String, idCliente: String, tranneId: String = "") =
        progetti().any { it.id != tranneId && it.codice.equals(codice, ignoreCase = true) && it.idCliente == idCliente }

    private fun salvaElenco(l: List<Progetto>) = scrivi(leggi().copy(progetti = l))

    override suspend fun leggiAzione(azione: String, parametri: List<Pair<String, String>>): JSONObject {
        val p = parametri.toMap()
        return when (azione) {
            "progetti" -> {
                val cerca = p["cerca"].orEmpty().lowercase()
                val l = progetti().filter { pr ->
                    (p["idCommessa"].isNullOrBlank() || pr.idCommessa.equals(p["idCommessa"], ignoreCase = true)) &&
                        (p["stato"].isNullOrBlank() || pr.stato.equals(p["stato"], ignoreCase = true)) &&
                        (cerca.isBlank() || listOf(pr.codice, pr.intestatoA, pr.descrizione, pr.idCommessa).any { it.lowercase().contains(cerca) })
                }.map(::conConti).sortedByDescending { it.creato }
                JSONObject().put("ok", true).put("progetti", arr(l.map { it.aJson() }))
            }
            "progetto" -> {
                val pr = progetti().firstOrNull { it.id == p["id"] } ?: no("Progetto non trovato")
                val suoi = rapportini().filter { it.idProgetto == pr.id }.sortedByDescending { it.data }
                JSONObject().put("ok", true).put("progetto", conConti(pr).aJson()).put("rapportini", arr(suoi.map { it.comeDalFoglio() }))
            }
            "codiceProgetto" -> {
                // Come il server: anche per una commessa che non c'e' ancora (nasce col rapportino); non rifiuta mai.
                val c = leggi().commessa(p["idCommessa"].orEmpty())
                val pr = if (c != null) proposta(c.id, c.idCliente) else proposta(p["idCommessa"].orEmpty(), p["idCliente"].orEmpty())
                JSONObject().put("ok", true).put("codice", pr.codice).put("da", pr.da)
            }
            else -> no("Nella visita guidata è un esempio")
        }
    }

    override suspend fun scriviAzione(corpo: JSONObject): JSONObject {
        val ora = LocalDateTime.now().withNano(0).toString()
        return when (corpo.testo("azione")) {
            "creaProgetto" -> {
                val c = leggi().commessa(corpo.testo("idCommessa"))
                    ?: no(if (corpo.testo("idCommessa").isBlank()) "Scegli la commessa del progetto" else "Commessa ${corpo.testo("idCommessa")} non trovata")
                val descrizione = corpo.testo("descrizione")
                if (descrizione.isBlank()) no("Scrivi la descrizione del progetto")
                val proposta = proposta(c.id, c.idCliente)
                var codice = corpo.testo("codiceProgetto")
                if (codice.isBlank()) codice = proposta.codice.ifBlank { no("Scrivi il codice del progetto: dopo i primi due Wisper lo propone da solo") }
                if (giaPreso(codice, c.idCliente)) {
                    if (!corpo.optBoolean("codiceProposto") || proposta.codice.isBlank()) no("Il codice $codice è già di un altro progetto di questo cliente")
                    codice = proposta.codice
                }
                val id = ((progetti().mapNotNull { it.id.toIntOrNull() }.maxOrNull() ?: 0) + 1).toString()
                val nuovo = Progetto(id, idLocale = corpo.testo("idLocale"), idCommessa = c.id, idCliente = c.idCliente, codice = codice,
                    intestatoA = corpo.testo("intestatoA"), descrizione = descrizione,
                    codiceAutomatico = proposta.codice.isNotBlank() && codice.equals(proposta.codice, ignoreCase = true), creato = ora, modificato = ora)
                salvaElenco(progetti() + nuovo)
                JSONObject().put("ok", true).put("progetto", nuovo.aJson().put("giaEsisteva", false))
            }
            "aggiornaProgetto" -> {
                val id = corpo.testo("id")
                var pr = progetti().firstOrNull { it.id == id } ?: no("Progetto non trovato")
                val k = corpo.optJSONObject("campi") ?: JSONObject()
                val conRapportini = rapportini().any { it.idProgetto == pr.id }
                if (k.has("idCommessa") && !k.testo("idCommessa").equals(pr.idCommessa, ignoreCase = true)) {
                    val m = leggi().commessa(k.testo("idCommessa")) ?: no("Commessa ${k.testo("idCommessa")} non trovata")
                    if (conRapportini) no("Il progetto ha già dei rapportini: la commessa non si cambia")
                    pr = pr.copy(idCommessa = m.id, idCliente = m.idCliente)
                }
                if (k.has("codice")) {
                    val codice = k.testo("codice")
                    if (codice.isBlank()) no("Il codice del progetto non può essere vuoto")
                    if (!codice.equals(pr.codice, ignoreCase = true)) pr = pr.copy(codiceAutomatico = false)
                    pr = pr.copy(codice = codice)
                }
                if ((k.has("codice") || k.has("idCommessa")) && giaPreso(pr.codice, pr.idCliente, pr.id)) no("Il codice ${pr.codice} è già di un altro progetto di questo cliente")
                if (k.has("intestatoA")) pr = pr.copy(intestatoA = k.testo("intestatoA"))
                if (k.has("descrizione")) {
                    if (k.testo("descrizione").isBlank()) no("La descrizione del progetto non può essere vuota")
                    pr = pr.copy(descrizione = k.testo("descrizione"))
                }
                if (k.has("stato")) pr = pr.copy(stato = k.testo("stato").uppercase())
                pr = pr.copy(modificato = ora)
                salvaElenco(progetti().map { if (it.id == pr.id) pr else it })
                JSONObject().put("ok", true).put("progetto", conConti(pr).aJson())
            }
            "togliProgetto" -> {
                val pr = progetti().firstOrNull { it.id == corpo.testo("id") } ?: no("Progetto non trovato")
                if (rapportini().any { it.idProgetto == pr.id }) no("Il progetto ha dei rapportini: non si toglie, si chiude")
                salvaElenco(progetti().filterNot { it.id == pr.id })
                JSONObject().put("ok", true)
            }
            else -> no("Nella visita guidata è un esempio")
        }
    }

    override suspend fun file(id: String): Pair<ByteArray, String> = no("Nella visita guidata è un esempio")
    override suspend fun carica(nome: String, mime: String, idFile: String, per: String, dati: ByteArray): JSONObject = no("Nella visita guidata è un esempio")
}
