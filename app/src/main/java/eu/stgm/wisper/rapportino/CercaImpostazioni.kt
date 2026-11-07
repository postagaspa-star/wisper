package eu.stgm.wisper.rapportino

/*
 * "Cerca nelle impostazioni" in cima ad Amministrazione (06/11/2026): si trovano le pagine (titolo, gruppo, la riga
 * sotto) e le singole impostazioni dentro le pagine. Senza accenti e senza maiuscole: "citta" trova "Città". Toccando
 * un risultato si apre la pagina e il campo si colora di giallo tenue per un attimo (ui/SalvaDaSolo.kt, Evidenzia).
 * Qui solo Kotlin semplice, per le prove: le parole dei campi stanno qui una volta sola e le pagine le usano.
 */

/** Un campo di una pagina delle impostazioni: come si chiama, la chiave, la tastiera ("testo", "cifre", "decimale", "email", "telefono", "sito"). */
data class CampoImpostazione(
    val titolo: String,
    val chiave: String,
    val tipo: String = "testo",
    val righe: Int = 1,
    val suffisso: String? = null,
    /** Altre parole con cui lo si cerca ("piva" per Partita IVA). */
    val altre: String = "",
)

/** Le voci della pagina Dati dello studio, nell'ordine in cui si vedono (06/11/2026). */
object CampiStudio {
    const val STUDIO_SDI = "STUDIO_SDI"
    const val PDF_NOME = "PDF_NOME"

    val STUDIO = listOf(
        CampoImpostazione("Ragione sociale", Anagrafiche.RAGIONE_SOCIALE, altre = "nome dello studio intestazione"),
        CampoImpostazione("Nome breve", "STUDIO_NOME_BREVE", altre = "menu email portale"),
        CampoImpostazione("Chi compila i rapportini", Anagrafiche.TECNICO, altre = "tecnico firma email"),
        CampoImpostazione("Partita IVA", Anagrafiche.PARTITA_IVA, "cifre", altre = "piva p.iva"),
        CampoImpostazione("Codice fiscale", "CODICE_FISCALE", altre = "cf"),
        CampoImpostazione("Indirizzo", Anagrafiche.INDIRIZZO, altre = "via sede"),
        CampoImpostazione("CAP", "STUDIO_CAP", "cifre", altre = "codice postale"),
        CampoImpostazione("Comune", "STUDIO_COMUNE", altre = "citta paese"),
        CampoImpostazione("Provincia", "STUDIO_PROVINCIA"),
        CampoImpostazione("Codice SDI", STUDIO_SDI, altre = "codice destinatario fattura elettronica"),
        CampoImpostazione("Email per le risposte", Anagrafiche.EMAIL, "email", altre = "posta indirizzo"),
        CampoImpostazione("Telefono", Anagrafiche.TELEFONO, "telefono", altre = "cellulare numero"),
        CampoImpostazione("PEC", Anagrafiche.PEC, "email", altre = "posta certificata"),
        CampoImpostazione("Sito", "STUDIO_SITO", "sito", altre = "internet web"),
        CampoImpostazione("Riga in fondo ai PDF", "PDF_PIEDE", righe = 2, altre = "piede pie di pagina"),
    )

    val ALBO = listOf(
        CampoImpostazione("Albo", "ALBO", altre = "ordine collegio periti"),
        CampoImpostazione("Provincia dell'albo", "ALBO_PROVINCIA"),
        CampoImpostazione("Numero di iscrizione", "ALBO_NUMERO", altre = "albo"),
        CampoImpostazione("Data di iscrizione", "ALBO_DATA", altre = "albo"),
    )

    /** Quello che la legge chiede in ogni preventivo (fase2.md §2.1, §3). */
    val PREVENTIVI = listOf(
        CampoImpostazione("Polizza professionale: compagnia", "POLIZZA_COMPAGNIA", altre = "assicurazione"),
        CampoImpostazione("Numero della polizza", "POLIZZA_NUMERO", altre = "assicurazione"),
        CampoImpostazione("Massimale", "POLIZZA_MASSIMALE", altre = "polizza assicurazione"),
        CampoImpostazione("Titoli e specializzazioni", "TITOLI", righe = 3),
        CampoImpostazione("IVA", "IVA", "decimale", suffisso = "%", altre = "percentuale preventivi"),
        CampoImpostazione("Contributo integrativo EPPI", "EPPI_INTEGRATIVO", "decimale", suffisso = "%", altre = "cassa percentuale"),
        CampoImpostazione("Validità dei preventivi", "PREVENTIVO_VALIDITA_GIORNI", "cifre", suffisso = "giorni", altre = "scadenza"),
        CampoImpostazione("Condizioni dei preventivi", "PREVENTIVO_CONDIZIONI", righe = 5, altre = "clausole"),
    )

    /** Il codice SDI: vuoto, o 7 lettere o cifre (si scrive in maiuscolo). */
    fun erroreSdi(t: String): String? =
        if (t.isEmpty() || Regex("^[A-Z0-9]{7}$").matches(t)) null else "Il codice SDI ha 7 lettere o cifre"

    /** Il codice SDI come si salva: maiuscolo, senza spazi. */
    fun sdi(t: String): String = t.uppercase().filterNot { it.isWhitespace() }

    /** Un sì/no salvato come testo ("true", "false", "SI", vuoto = [base]). */
    fun acceso(valore: String, base: Boolean = true): Boolean {
        val v = valore.trim().lowercase()
        return when {
            v.isEmpty() -> base
            v in setOf("true", "1", "si", "sì", "yes") -> true
            v in setOf("false", "0", "no") -> false
            else -> base
        }
    }
}

/**
 * Una cosa che la ricerca trova: una pagina ([chiave] vuota) o un'impostazione dentro una pagina. [rotta] è la pagina
 * di Amministrazione ("studio", "tariffe", …; "integrazioni" è la sezione Integrazioni). [richiede] è il modulo che
 * bisogna vedere perché la voce ci sia (vuoto = tutti quelli che vedono Amministrazione).
 */
data class VoceCercabile(
    val titolo: String,
    val dove: String,
    val rotta: String,
    val chiave: String = "",
    val sotto: String = "",
    val richiede: String = "",
    val altre: String = "",
)

object CercaImpostazioni {

    /** Minuscolo, senza accenti, gli apostrofi e la punteggiatura come spazi: "dell'albo" trova "albo". */
    fun semplice(t: String): String =
        java.text.Normalizer.normalize(t.lowercase(), java.text.Normalizer.Form.NFD)
            .replace(Regex("\\p{M}+"), "")
            .replace(Regex("[^a-z0-9%@]+"), " ")
            .trim()

    /**
     * Le voci che hanno tutte le parole di [testo] (nel titolo, in dove sta, nella riga sotto, nelle altre parole). Prima
     * quelle il cui titolo comincia col testo, poi quelle col testo nel titolo, poi le altre; a pari merito l'ordine
     * dell'elenco. Una stessa voce (titolo e pagina) una volta sola. Testo vuoto: niente.
     */
    fun trova(voci: List<VoceCercabile>, testo: String, quante: Int = 40): List<VoceCercabile> {
        val q = semplice(testo)
        if (q.isEmpty()) return emptyList()
        val parole = q.split(' ').filter { it.isNotEmpty() }
        return voci.asSequence()
            .distinctBy { semplice(it.titolo) + "|" + it.rotta + "|" + it.chiave.ifEmpty { "-" } }
            .mapIndexedNotNull { i, v ->
                val titolo = semplice(v.titolo)
                val tutto = listOf(titolo, semplice(v.dove), semplice(v.sotto), semplice(v.altre)).joinToString(" ")
                if (!parole.all { tutto.contains(it) }) null
                else {
                    val rango = when {
                        titolo.startsWith(q) -> 0
                        parole.all { titolo.contains(it) } -> 1
                        else -> 2
                    }
                    Triple(rango, i, v)
                }
            }
            .sortedWith(compareBy({ it.first }, { it.second }))
            .take(quante)
            .map { it.third }
            .toList()
    }

    private fun campi(lista: List<CampoImpostazione>, dove: String, rotta: String, richiede: String = "") =
        lista.map { VoceCercabile(it.titolo, dove, rotta, it.chiave, richiede = richiede, altre = it.altre) }

    /**
     * Le impostazioni che stanno sempre nelle stesse pagine, con le parole che si vedono a schermo. Quelle di
     * Impostazioni generali e le funzioni arrivano dal server e si aggiungono a parte ([daGenerali], [daFunzioni]).
     */
    val CAMPI: List<VoceCercabile> = buildList {
        addAll(campi(CampiStudio.STUDIO, "Dati dello studio", "studio"))
        addAll(campi(CampiStudio.ALBO, "Dati dello studio · Iscrizione all'albo", "studio"))
        add(VoceCercabile("Logo", "Dati dello studio", "studio", "STUDIO_LOGO", altre = "immagine marchio"))
        add(VoceCercabile("Logo sui PDF", "Dati dello studio", "studio", "PDF_LOGO", altre = "intestazione"))
        add(VoceCercabile("Nome dello studio accanto al logo", "Dati dello studio", "studio", CampiStudio.PDF_NOME, altre = "intestazione pdf ragione sociale"))
        addAll(campi(CampiStudio.PREVENTIVI, "Dati dello studio · Per i preventivi", "studio"))
        add(VoceCercabile("La tua firma", "Dati dello studio", "studio", "FIRMA_TECNICO", altre = "firma rapportini"))

        add(VoceCercabile("Rimborso km", "Tariffe e rimborsi", "tariffe", Anagrafiche.EURO_KM, altre = "chilometri aci euro"))
        add(VoceCercabile("Auto", "Tariffe e rimborsi", "tariffe", Anagrafiche.AUTO, altre = "macchina veicolo"))
        add(VoceCercabile("Quanto ti costa un'ora", "Tariffe e rimborsi", "tariffe", Anagrafiche.COSTO_ORARIO, altre = "costo orario"))
        add(VoceCercabile("Campo ticket nei rapportini", "Tariffe e rimborsi", "tariffe", Anagrafiche.TICKET_ATTIVO, altre = "buono pasto"))

        val fiscale = "Impostazioni fiscali"
        add(VoceCercabile("IVA", fiscale, "fiscale", "IVA", richiede = Moduli.FATTURAZIONE, altre = "aliquote"))
        add(VoceCercabile("Contributo integrativo EPPI", fiscale, "fiscale", "EPPI_INTEGRATIVO", richiede = Moduli.FATTURAZIONE, altre = "aliquote cassa"))
        add(VoceCercabile("Ritenuta", fiscale, "fiscale", "RITENUTA", richiede = Moduli.FATTURAZIONE, altre = "aliquote acconto"))
        add(VoceCercabile("Bollo: scatta sopra", fiscale, "fiscale", "BOLLO_SOGLIA", richiede = Moduli.FATTURAZIONE, altre = "marca da bollo soglia"))
        add(VoceCercabile("Importo del bollo", fiscale, "fiscale", "BOLLO_IMPORTO", richiede = Moduli.FATTURAZIONE, altre = "marca da bollo"))
        add(VoceCercabile("Lo riaddebito al cliente", fiscale, "fiscale", "BOLLO_RIVALSA", richiede = Moduli.FATTURAZIONE, altre = "bollo rivalsa"))
        add(VoceCercabile("Documento", fiscale, "fiscale", "TIPO_DOCUMENTO", richiede = Moduli.FATTURAZIONE, altre = "fattura parcella td01 td06 regime forfettario ordinario"))
        add(VoceCercabile("Giorni di pagamento", fiscale, "fiscale", "GIORNI_PAGAMENTO", richiede = Moduli.FATTURAZIONE, altre = "scadenza"))
        add(VoceCercabile("Poi a fine mese", fiscale, "fiscale", "PAGAMENTO_FINE_MESE", richiede = Moduli.FATTURAZIONE, altre = "pagamento"))
        add(VoceCercabile("Soglia del saldo previsto", fiscale, "fiscale", "SOGLIA_CASSA", richiede = Moduli.FATTURAZIONE, altre = "cassa"))
        add(VoceCercabile("Regole confermate dal commercialista", fiscale, "fiscale", "CONFERMA_FISCALE", richiede = Moduli.FATTURAZIONE))

        add(VoceCercabile("Il codice delle commesse", "Numerazioni", "formato-commessa", altre = "formato numero commessa 26st001 anno separatore cifre"))

        val notifiche = "Notifiche"
        add(VoceCercabile("Avvisami sul telefono", notifiche, "notifiche", "NOTIFICHE_TELEFONO"))
        add(VoceCercabile("Di sera e nei festivi niente avvisi sul telefono", notifiche, "notifiche", "NOTIFICHE_SILENZIO", altre = "notte silenzio"))
        PreferenzeNotifiche.GRUPPI.forEach { (gruppo, tipi) ->
            tipi.forEach { (k, nome) -> add(VoceCercabile(nome, "$notifiche · $gruppo", "notifiche", "NOTIFICA_$k")) }
        }
        add(VoceCercabile("Avvisi del server a", "$notifiche · Per lo studio", "notifiche", "EMAIL_AVVISI", altre = "email"))
        add(VoceCercabile("Ora del riepilogo del mattino", "$notifiche · Per lo studio", "notifiche", "NOTIFICHE_ORA"))

        add(VoceCercabile("Un dispositivo esce da solo dopo", "Sicurezza · Durata degli accessi", "sicurezza", "SESSIONE_GIORNI", altre = "sessione giorni"))
        add(VoceCercabile("Cifratura della copia", "Sicurezza", "sicurezza", altre = "chiave drive"))
        add(VoceCercabile("Scollega tutti i dispositivi", "Sicurezza", "sicurezza"))

        val portale = "Portale clienti"
        add(VoceCercabile("Indirizzo del portale", portale, "portale", "PORTALE_INDIRIZZO", altre = "netlify"))
        add(VoceCercabile("Portale acceso", portale, "portale", "PORTALE_ATTIVO", altre = "spegni"))
        add(VoceCercabile("Link e codice valgono", "$portale · Ingresso e file", "portale", "PORTALE_LINK_MINUTI", altre = "minuti"))
        add(VoceCercabile("Sessione senza uso", "$portale · Ingresso e file", "portale", "PORTALE_SESSIONE_MINUTI"))
        add(VoceCercabile("Sessione al massimo", "$portale · Ingresso e file", "portale", "PORTALE_SESSIONE_ORE"))
        add(VoceCercabile("Grandezza massima di un file", "$portale · Ingresso e file", "portale", "PORTALE_FILE_MAX_MB", altre = "mb"))
        add(VoceCercabile("Email lasciate allo studio", "$portale · Ingresso e file", "portale", "PORTALE_EMAIL_RISERVA"))
        add(VoceCercabile("Informativa per i clienti", portale, "portale", "PORTALE_INFORMATIVA", altre = "privacy"))

        val com = "Comunicazioni"
        add(VoceCercabile("WhatsApp sul telefono", com, "comunicazioni", "WHATSAPP_APP", altre = "business"))
        add(VoceCercabile("Promemoria degli appuntamenti", com, "comunicazioni", "PROMEMORIA_GIORNI_PRIMA"))
        add(VoceCercabile("Promemoria di pagamento dopo", com, "comunicazioni", "SOLLECITO_DOPO_GIORNI", altre = "sollecito"))
        add(VoceCercabile("Il secondo dopo", com, "comunicazioni", "SOLLECITO_SECONDO_GIORNI", altre = "sollecito promemoria pagamento"))

        val pmc = "Persone, mezzi e collaboratori"
        add(VoceCercabile("Santo patrono", "$pmc · Persone", "persone", "FESTA_PATRONO", altre = "festa"))
        add(VoceCercabile("Conservazione dopo l'uscita", "$pmc · Persone", "persone", "PERSONE_CONSERVA_ANNI"))
        add(VoceCercabile("Saldo da aggiornare dopo", "$pmc · Persone", "persone", "SALDO_AVVISO_GIORNI", altre = "ferie"))
        add(VoceCercabile("Tarature: ogni, per gli strumenti nuovi", "$pmc · Tarature e verifiche", "persone", "TARATURA_OGNI_MESI", altre = "strumenti"))
        add(VoceCercabile("Preavviso delle tarature", "$pmc · Tarature e verifiche", "persone", "TARATURA_PREAVVISO_GIORNI"))
        add(VoceCercabile("Con la taratura scaduta", "$pmc · Tarature e verifiche", "persone", "TARATURA_BLOCCO"))
        add(VoceCercabile("Un DURC vale", "$pmc · Collaboratori esterni", "persone", "DURC_GIORNI"))
        add(VoceCercabile("La visura al massimo di", "$pmc · Collaboratori esterni", "persone", "VISURA_MESI"))
        add(VoceCercabile("Accesso degli esterni senza incarichi", "$pmc · Collaboratori esterni", "persone", "ACCESSO_ESTERNI_GIORNI"))
        add(VoceCercabile("I documenti che servono per l'idoneità", "$pmc · Collaboratori esterni", "persone", "COLLAB_DOCUMENTI", altre = "durc visura polizza"))
        add(VoceCercabile("Avviso del tagliando a km", "$pmc · Mezzi", "persone", "KM_TAGLIANDO_AVVISO", altre = "auto furgone"))

        add(VoceCercabile("Fai una copia adesso", "Copie e ripristino", "copie", altre = "backup"))
        add(VoceCercabile("Prova automatica della copia", "Copie e ripristino", "copie", altre = "backup"))
        add(VoceCercabile("Segna il ripristino provato", "Copie e ripristino", "copie", altre = "backup"))
        add(VoceCercabile("Il cambio", "Lista di controllo", "controlli"))
        add(VoceCercabile("Tema chiaro o scuro", "Aspetto", "aspetto", altre = "colori notte"))
        add(VoceCercabile("Visita guidata", "Aspetto", "aspetto", altre = "tutorial"))
    }

    /** Le voci di Impostazioni generali, come le manda il server. */
    fun daGenerali(gruppi: List<GruppoImpostazioni>): List<VoceCercabile> = gruppi.flatMap { g ->
        g.voci.map { v -> VoceCercabile(v.etichetta, "Impostazioni generali · " + g.nome, "impostazioni", v.chiave) } +
            // Una riga che porta a un'altra pagina di Amministrazione (Impostazioni fiscali, Veicoli) porta lì.
            g.collegamenti.map { col ->
                VoceCercabile(col.nome, "Impostazioni generali · " + g.nome, if (col.pagina == "amministrazione") col.sezione.ifBlank { "studio" } else "impostazioni")
            }
    }

    /** Le funzioni da accendere o spegnere. */
    fun daFunzioni(funzioni: List<Funzione>): List<VoceCercabile> =
        funzioni.map { f -> VoceCercabile(f.nome, "Funzioni accese", "funzioni", "funzione-" + f.modulo, altre = "spegni accendi") }
}
