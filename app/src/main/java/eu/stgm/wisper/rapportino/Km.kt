package eu.stgm.wisper.rapportino

/**
 * I km da proporre in un lavoro del rapportino (12/11/2026, Manuel: "suggeriti in automatico"; Andrea ha scelto: dal luogo
 * del lavoro, andata e ritorno; docs/gestionale/km.md). La regola di pc/ui/regole-km.js, con gli stessi casi
 * (pc/prove/casi-km.json, KmTest).
 *
 * Due fonti, in quest'ordine per ogni luogo: "Ultima volta" (i km dell'ultimo lavoro con i km per lo stesso posto: se Manuel
 * li ha corretti si riprendono i suoi) e "Dallo studio" (kmStudio che il server mette su progetti, commesse e clienti: la
 * strada in auto dallo studio, andata e ritorno). Il posto: col progetto e' il progetto (mai i km di un altro progetto della
 * stessa commessa); un progetto senza "Intestato a" e senza Dove e' del cliente stesso, quindi dopo valgono commessa e
 * cliente. Senza progetto: la commessa, poi il cliente.
 *
 * Un viaggio, una volta sola: se un lavoro PRIMA di questo nello stesso rapportino ha gia' i km ([kmPrima]) la proposta da
 * scrivere da sola non c'e' (restano le pillole): nei rapportini veri con piu' lavori i km non sono mai su tutti.
 */
object Km {
    /** Il lavoro: per chi e' (idProgetto vuoto = nessun progetto; un progetto nuovo usa il suo idLocale). */
    data class Lavoro(val idCliente: String = "", val idCommessa: String = "", val idProgetto: String = "")

    /** Il progetto scelto: a chi e' intestato, dove si lavora, i km dallo studio (null = non si sanno). */
    data class Luogo(val intestatoA: String = "", val dove: String = "", val kmStudio: Double? = null)

    /** Un altro lavoro gia' scritto: data in ISO (2026-11-05), i suoi km. */
    data class Storia(val data: String, val idCliente: String = "", val idCommessa: String = "", val idProgetto: String = "", val km: Double)

    /** [da]: "ultima" o "studio". */
    data class Proposta(val km: Double, val da: String)

    /** La proposta (la prima che c'e') e le prime di ognuna delle due fonti, per le pillole. */
    data class Proposte(val proposta: Proposta?, val ultima: Double?, val studio: Double?)

    /** I km dell'ultimo lavoro (per data; a parita' il primo dell'elenco) che passa il filtro, con km > 0. */
    private fun ultimi(storico: List<Storia>, passa: (Storia) -> Boolean): Double? {
        var meglio: Storia? = null
        for (s in storico) {
            if (s.km <= 0 || !passa(s)) continue
            if (meglio == null || s.data > meglio.data) meglio = s
        }
        return meglio?.km
    }

    fun proposte(lavoro: Lavoro, progetto: Luogo?, kmCommessa: Double?, kmCliente: Double?, storico: List<Storia>, kmPrima: Boolean = false): Proposte {
        val candidati = mutableListOf<Proposta>()
        fun metti(da: String, km: Double?) { if (km != null && km > 0) candidati.add(Proposta(km, da)) }
        val conProgetto = lavoro.idProgetto.isNotBlank()
        if (conProgetto) {
            metti("ultima", ultimi(storico) { it.idProgetto == lavoro.idProgetto })
            metti("studio", progetto?.kmStudio)
        }
        val delCliente = !conProgetto || progetto == null || (progetto.intestatoA.isBlank() && progetto.dove.isBlank())
        if (delCliente) {
            if (lavoro.idCommessa.isNotBlank()) {
                // I lavori con un progetto erano nel posto del loro progetto: per la commessa e il cliente contano solo gli altri.
                metti("ultima", ultimi(storico) { it.idCommessa == lavoro.idCommessa && it.idProgetto.isBlank() })
                metti("studio", kmCommessa)
            }
            if (lavoro.idCliente.isNotBlank()) {
                metti("ultima", ultimi(storico) { it.idCliente == lavoro.idCliente && it.idProgetto.isBlank() })
                metti("studio", kmCliente)
            }
        }
        return Proposte(if (kmPrima) null else candidati.firstOrNull(), candidati.firstOrNull { it.da == "ultima" }?.km, candidati.firstOrNull { it.da == "studio" }?.km)
    }

    /**
     * Il Dove di un altro progetto con lo stesso "Intestato a" (lo stesso posto), il piu' recente che ce l'ha; "" se nessuno.
     * Come doveDiIntestato di pc/ui/regole-progetti.js e del server.
     */
    fun doveDiIntestato(progetti: List<Progetto>, intestatoA: String, tranneId: String = ""): String {
        val k = norma(intestatoA)
        if (k.isBlank()) return ""
        return progetti.filter { (tranneId.isBlank() || it.id != tranneId) && norma(it.intestatoA) == k && it.dove.isNotBlank() }
            .sortedWith(compareByDescending<Progetto> { it.creato }.thenByDescending { it.id.toLongOrNull() ?: 0L })
            .firstOrNull()?.dove?.trim().orEmpty()
    }

    private fun norma(s: String): String =
        java.text.Normalizer.normalize(s, java.text.Normalizer.Form.NFD).replace(Regex("\\p{Mn}+"), "").lowercase().trim().replace(Regex("\\s+"), " ")
}
