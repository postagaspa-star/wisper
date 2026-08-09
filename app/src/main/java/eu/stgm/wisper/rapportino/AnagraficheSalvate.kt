package eu.stgm.wisper.rapportino

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * L'elenco di clienti e commesse tenuto sul telefono, in un file.
 *
 * PERCHE' ESISTE, trovato la mattina del 09/08 col cronometro in mano. Il
 * foglio Google, chiamato da freddo, ci ha messo sette secondi una volta e
 * tredici quella dopo. L'apertura per posizione ha bisogno di quell'elenco, e
 * aspettarlo voleva dire stare zitti tredici secondi dopo la parola magica:
 * inaccettabile per una cosa che deve rispondere subito.
 *
 * Cosi' invece l'elenco di ieri e' gia' qui, si legge in un istante e Wisper
 * parla subito. Il foglio si rilegge dopo, con calma, e riscrive questo file
 * per la volta successiva.
 *
 * Il rischio e' lavorare su dati di ieri, ed e' piccolo: clienti e commesse
 * cambiano qualche volta al mese, non qualche volta al minuto. E se il
 * tecnico nomina qualcosa che qui non c'e', quella cosa viene creata, che e'
 * esattamente quello che sarebbe successo comunque.
 *
 * In piu' viene gratis una cosa che serviva davvero: in un capannone senza
 * campo Wisper conosce lo stesso i cantieri e sa dove sei.
 */
class AnagraficheSalvate(ctx: Context) {

    private val file = File(ctx.filesDir, "anagrafiche.json")

    /** Quello che c'era l'ultima volta, o un elenco vuoto la primissima volta. */
    fun leggi(): Anagrafiche = try {
        if (!file.exists()) Anagrafiche() else daJson(JSONObject(file.readText()))
    } catch (_: Exception) {
        Anagrafiche()
    }

    /**
     * Salva, ma solo se c'e' qualcosa da salvare: sovrascrivere un elenco buono
     * con uno vuoto, perche' il foglio non ha risposto, e' il modo piu' rapido
     * per perdere l'unica copia che avevamo.
     */
    fun scrivi(a: Anagrafiche) {
        if (a.clienti.isEmpty() && a.commesse.isEmpty()) return
        try {
            file.writeText(aJson(a).toString())
        } catch (_: Exception) {
            // Se non si riesce a scrivere si va avanti lo stesso: e' una
            // comodita', non un pezzo da cui dipende il funzionamento.
        }
    }

    private fun aJson(a: Anagrafiche) = JSONObject().apply {
        put(
            "clienti",
            JSONArray().apply {
                a.clienti.forEach { c ->
                    put(
                        JSONObject()
                            .put("id", c.id)
                            .put("nome", c.nome)
                            .put("alias", JSONArray(c.alias)),
                    )
                }
            },
        )
        put(
            "commesse",
            JSONArray().apply {
                a.commesse.forEach { m ->
                    put(
                        JSONObject()
                            .put("id", m.id)
                            .put("idCliente", m.idCliente)
                            .put("descrizione", m.descrizione)
                            .put("stato", m.stato)
                            .put("indirizzo", m.indirizzo),
                    )
                }
            },
        )
    }

    private fun daJson(o: JSONObject) = Anagrafiche(
        clienti = o.optJSONArray("clienti").let { arr ->
            (0 until (arr?.length() ?: 0)).mapNotNull { i ->
                arr?.optJSONObject(i)?.let { c ->
                    Cliente(
                        id = c.optString("id"),
                        nome = c.optString("nome"),
                        alias = c.optJSONArray("alias").let { a ->
                            (0 until (a?.length() ?: 0)).map { a!!.optString(it) }
                        }.filter { it.isNotBlank() },
                    )
                }
            }
        }.filter { it.nome.isNotBlank() },
        commesse = o.optJSONArray("commesse").let { arr ->
            (0 until (arr?.length() ?: 0)).mapNotNull { i ->
                arr?.optJSONObject(i)?.let { m ->
                    Commessa(
                        id = m.optString("id"),
                        idCliente = m.optString("idCliente"),
                        descrizione = m.optString("descrizione"),
                        stato = m.optString("stato"),
                        indirizzo = m.optString("indirizzo"),
                    )
                }
            }
        }.filter { it.id.isNotBlank() },
    )
}
