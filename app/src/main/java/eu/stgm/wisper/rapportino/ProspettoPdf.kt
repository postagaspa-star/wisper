package eu.stgm.wisper.rapportino

import org.json.JSONObject
import java.time.LocalDate

/**
 * Le pagine del prospetto e della pre-parcella fatte dal telefono (fase4.md
 * §8.3), finché pc/ui/documenti.js non ha prospettoFattura() e avvisoParcella():
 * stesso carattere, stessi grigi dei PDF di Wisper, niente giallo (si stampa in
 * bianco e nero). I dati sono solo quelli del pacchetto del server: il telefono
 * non ricalcola niente.
 */
object ProspettoPdf {

    private fun esc(s: String) = s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;")

    private const val STILE = "<style>" +
        "@font-face { font-family: 'Figtree'; src: url('/font/Figtree.ttf') format('truetype'); font-weight: 300 900; }" +
        "@page { size: A4; margin: 14mm 14mm 18mm 14mm; @bottom-right { content: 'Pagina ' counter(page) ' / ' counter(pages); font: 500 8.5px Figtree, Arial, sans-serif; color: #8A8A92; } }" +
        "* { box-sizing: border-box; } body { margin: 0; font: 500 10.5px/1.45 Figtree, Arial, sans-serif; color: #1B1B1F; }" +
        ".testa { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1B1B1F; padding-bottom: 10px; margin-bottom: 12px; }" +
        ".azienda { font-size: 16px; font-weight: 800; } .tipo { text-align: right; } .etichetta { font-size: 8.5px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: #5F5F67; }" +
        ".numero { font-size: 18px; font-weight: 800; } .avviso { border: 1.5px solid #1B1B1F; border-radius: 8px; padding: 7px 11px; font-weight: 700; margin-bottom: 12px; }" +
        "h3 { font-size: 11.5px; font-weight: 800; margin: 12px 0 4px; } table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }" +
        "td { border-bottom: 1px solid #EFEEEB; padding: 4px 4px; vertical-align: top; } td.e { width: 38%; color: #5F5F67; font-weight: 600; } td.v { font-weight: 700; }" +
        "th { font-size: 8.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: #5F5F67; text-align: left; border-bottom: 1.5px solid #1B1B1F; padding: 4px; }" +
        ".n { text-align: right; white-space: nowrap; } tr { break-inside: avoid; } .piede { margin-top: 16px; color: #5F5F67; font-size: 9.5px; border-top: 1px solid #E6E5E1; padding-top: 6px; }" +
        ".tot td { font-weight: 800; font-size: 12px; border-top: 1.5px solid #1B1B1F; border-bottom: none; }" +
        "</style>"

    private fun pagina(titolo: String, corpo: String) =
        "<!doctype html><html lang=\"it\"><head><meta charset=\"utf-8\"><title>${esc(titolo)}</title>$STILE</head><body>$corpo</body></html>"

    private fun piede(regole: RegoleFiscali, oggi: LocalDate): String =
        "Preparato da Wisper il ${dataIt(oggi.toString())} · " +
            if (regole.confermate) "regole fiscali confermate dal commercialista il ${dataIt(regole.confermateIl)}"
            else "regole fiscali NON ancora confermate dal commercialista: conti da verificare"

    /** Il prospetto: le sezioni del server, campo per campo, nell'ordine in cui un programma li chiede. */
    fun prospetto(p: Pacchetto, riferimento: String, studio: String, regole: RegoleFiscali, oggi: LocalDate = LocalDate.now()): String {
        val corpo = StringBuilder()
        corpo.append("<div class=\"testa\"><div class=\"azienda\">${esc(studio)}</div><div class=\"tipo\"><div class=\"etichetta\">${esc(p.titolo)} · non è una fattura</div>")
            .append("<div class=\"numero\">Rif. ${esc(riferimento)}</div></div></div>")
        if (p.avviso.isNotBlank()) corpo.append("<div class=\"avviso\">${esc(p.avviso)}</div>")
        p.sezioni.forEach { s ->
            corpo.append("<h3>${esc(s.titolo)}</h3><table>")
            s.campi.forEach { c -> corpo.append("<tr><td class=\"e\">${esc(c.etichetta)}</td><td class=\"v\">${esc(c.valore)}</td></tr>") }
            corpo.append("</table>")
        }
        corpo.append("<div class=\"piede\">${esc(piede(regole, oggi))}</div>")
        return pagina("Prospetto $riferimento", corpo.toString())
    }

    /**
     * La pre-parcella (fase4.md §8.3, fino alla 1.3 "avviso di parcella"): cliente, righe, totali, netto, IBAN, e il
     * piede "Documento senza valore fiscale: la fattura si emette al pagamento".
     *
     * 1.4.0 (servizi.md §3): la stessa pagina fa da ripiego anche per la parcella di una fattura emessa ([titolo]
     * "Parcella", "Fattura" o "Nota di credito", [preParcella] falso: il numero della fattura e niente frase sul valore
     * fiscale), finché pc/ui/documenti.js nel telefono non ha parcella().
     */
    fun avviso(
        modello: JSONObject, studio: String, regole: RegoleFiscali, oggi: LocalDate = LocalDate.now(),
        titolo: String = "Pre-parcella", preParcella: Boolean = true,
    ): String {
        val cl = modello.optJSONObject("committente") ?: JSONObject()
        val nome = cl.testo("denominazione").ifBlank { listOf(cl.testo("nome"), cl.testo("cognome")).filter { it.isNotBlank() }.joinToString(" ") }
        val sede = cl.optJSONObject("sede")
        val corpo = StringBuilder()
        val numero = if (preParcella) "Rif. " + modello.testo("riferimento") else modello.testo("numero").ifBlank { "Rif. " + modello.testo("riferimento") }
        val data = if (preParcella) oggi.toString() else modello.testo("data").ifBlank { oggi.toString() }
        corpo.append("<div class=\"testa\"><div class=\"azienda\">${esc(studio)}</div><div class=\"tipo\"><div class=\"etichetta\">${esc(titolo)}</div>")
            .append("<div class=\"numero\">${esc(numero)}</div><div>${esc(dataIt(data))}</div></div></div>")
        corpo.append("<h3>Cliente</h3><table><tr><td class=\"e\">Nome</td><td class=\"v\">${esc(nome)}</td></tr>")
        if (sede != null) corpo.append("<tr><td class=\"e\">Indirizzo</td><td class=\"v\">${esc(listOf(sede.testo("indirizzo"), listOf(sede.testo("cap"), sede.testo("comune")).filter { it.isNotBlank() }.joinToString(" "), sede.testo("provincia")).filter { it.isNotBlank() }.joinToString(", "))}</td></tr>")
        corpo.append("</table><h3>Prestazioni</h3><table><tr><th>Descrizione</th><th class=\"n\">Importo</th></tr>")
        modello.optJSONArray("righe").oggetti().forEach { r ->
            corpo.append("<tr><td>${esc(r.testo("descrizione"))}</td><td class=\"n\">${esc(Numeri.euro(r.numero("prezzoTotale") ?: 0.0))}</td></tr>")
        }
        modello.optJSONObject("cassa")?.let { corpo.append("<tr><td>Contributo integrativo EPPI ${Numeri.scrivi(it.numero("aliquota"))}%</td><td class=\"n\">${esc(Numeri.euro(it.numero("importo") ?: 0.0))}</td></tr>") }
        modello.optJSONArray("riepilogo").oggetti().filter { (it.numero("imposta") ?: 0.0) > 0 }.forEach {
            corpo.append("<tr><td>IVA ${Numeri.scrivi(it.numero("aliquotaIva"))}%</td><td class=\"n\">${esc(Numeri.euro(it.numero("imposta") ?: 0.0))}</td></tr>")
        }
        corpo.append("<tr class=\"tot\"><td>Totale</td><td class=\"n\">${esc(Numeri.euro(modello.numero("totaleDocumento") ?: 0.0))}</td></tr>")
        modello.optJSONObject("ritenuta")?.let { corpo.append("<tr><td>Ritenuta ${Numeri.scrivi(it.numero("aliquota"))}% (la trattiene il cliente)</td><td class=\"n\">− ${esc(Numeri.euro(it.numero("importo") ?: 0.0))}</td></tr>") }
        corpo.append("<tr class=\"tot\"><td>Da pagare</td><td class=\"n\">${esc(Numeri.euro(modello.numero("nettoAPagare") ?: 0.0))}</td></tr></table>")
        modello.optJSONObject("pagamento")?.optJSONArray("dettagli").oggetti().firstOrNull()?.let { d ->
            corpo.append("<h3>Pagamento</h3><table><tr><td class=\"e\">Bonifico</td><td class=\"v\">${esc(d.testo("iban"))}</td></tr>")
            if (d.testo("istituto").isNotBlank()) corpo.append("<tr><td class=\"e\">Banca</td><td class=\"v\">${esc(d.testo("istituto"))}</td></tr>")
            corpo.append("</table>")
        }
        if (preParcella) {
            corpo.append("<div class=\"piede\">Documento senza valore fiscale: la fattura si emette al pagamento.")
            if (!regole.confermate) corpo.append(" Conti da verificare: regole non confermate dal commercialista.")
            corpo.append("</div>")
        } else {
            corpo.append("<div class=\"piede\">Copia di cortesia per il cliente: fa fede la fattura elettronica.</div>")
        }
        return pagina(titolo, corpo.toString())
    }
}
