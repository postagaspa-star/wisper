package eu.stgm.wisper

import eu.stgm.wisper.rapportino.PonteServer
import eu.stgm.wisper.rapportino.TrasportoFase5
import eu.stgm.wisper.rapportino.VoceDashboard
import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate
import java.util.Base64

/**
 * Integrazioni, calendario, amministrazione e lista di controllo della visita guidata
 * (fase8.md, prototipo Gestionale-fase8.html): un server finto in memoria che risponde come
 * quello vero (§13), coi nomi di esempio del prototipo. Solo dati di esempio: nessun
 * indirizzo vero, nessuna chiave. Scrivere dice che è un esempio.
 *
 * @param vociTutte le voci della Dashboard di esempio senza tetti (per Tutto quello che c'è da fare).
 */
class EsempioFase8(private val oggi: LocalDate = LocalDate.now(), private val vociTutte: () -> Triple<List<VoceDashboard>, List<VoceDashboard>, List<VoceDashboard>> = { Triple(emptyList(), emptyList(), emptyList()) }) : TrasportoFase5 {

    private val esempio = "Nella visita guidata è un esempio: qui non si salva niente"
    private fun ora(giorni: Long, h: Int, m: Int) = oggi.plusDays(giorni).atTime(h, m).toString() + ":00"
    private fun arr(l: List<JSONObject>) = JSONArray().apply { l.forEach { put(it) } }

    // -------------------------------------------------- integrazioni (§3.1, §4.2, prototipo INTEG)

    private fun ctr(quando: String, ok: Boolean, ms: Int, testo: String) =
        JSONObject().put("quando", quando).put("esito", if (ok) "ok" else "errore").put("millisecondi", ms).put("testo", testo)

    private fun integ(
        chiave: String, nome: String, cosa: String, gruppo: String, stato: String, quando: String = "", ms: Int? = null, esito: String = "", account: String = "",
        esce: String = "", costo: String = "", regole: String = "", perche: String = "", servirebbe: String = "", errori: Int = 0, controlli: List<JSONObject> = emptyList(),
    ) = JSONObject().put("chiave", chiave).put("nome", nome).put("cosa", cosa).put("gruppo", gruppo).put("stato", stato).put("controllato", quando)
        .put("millisecondi", ms ?: JSONObject.NULL).put("esito", esito).put("account", account).put("esce", esce).put("costo", costo).put("regole", regole)
        .put("provaAdesso", gruppo == "collegati" && stato != "non_collegato" && chiave != "link" && chiave != "ponte").put("perche", perche).put("servirebbe", servirebbe).put("erroriDiFila", errori)
        .put("controlli", arr(controlli)).put("dipende", if (gruppo == "scelta") "Dipende da una scelta: è nelle domande della fase 8" else "")

    private val integrazioni: List<JSONObject> by lazy {
        listOf(
            integ("postino", "Postino", "Email ai clienti, copie su Drive e foglio di ogni notte", "collegati", "collegato", ora(0, 10, 0), 412,
                "Risponde · Google lascia mandare ancora 86 email oggi", "il Gmail del foglio di Wisper", "Email e PDF ai clienti; la copia del database; le schede del foglio",
                "0 € (Gmail: 100 destinatari al giorno)", "Google · per il Gmail gratuito nessun accordo sul trattamento dei dati trovato",
                controlli = listOf(ctr(ora(0, 10, 0), true, 412, "Risponde"), ctr(ora(0, 9, 0), true, 388, "Risponde"), ctr(ora(0, 8, 0), true, 455, "Risponde"))),
            integ("vies", "Verifica della partita IVA", "Controlla le partite IVA e propone nome e indirizzo", "collegati", "errore", ora(0, 8, 30), 8000,
                "Il servizio europeo non risponde: riprova più tardi", "nessun account", "Solo la partita IVA cercata", "0 €", "Servizio pubblico della Commissione europea", errori = 2,
                controlli = listOf(ctr(ora(0, 8, 30), false, 8000, "Il servizio europeo non risponde"), ctr(ora(0, 6, 0), false, 8000, "Il servizio europeo non risponde"), ctr(ora(-1, 6, 0), true, 640, "Partita IVA dello studio valida"))),
            integ("aggiornamenti", "Aggiornamenti delle app", "Le app si aggiornano da sole da GitHub", "collegati", "collegato", ora(0, 6, 0), 310,
                "Ultima versione: telefono 0.9.0, computer 0.9.0 · 1 dispositivo è indietro", "il repository pubblico di Wisper", "Niente: le app scaricano", "0 €", "GitHub",
                controlli = listOf(ctr(ora(0, 6, 0), true, 310, "Elenco firmato letto"), ctr(ora(-1, 6, 0), true, 295, "Elenco firmato letto"))),
            integ("calendariofile", "Calendario: file da scaricare", "Gli impegni di Wisper in un file .ics per Outlook, Google Calendar o il telefono", "collegati", "collegato", ora(0, 6, 0), 12,
                "Si scarica il file", "nessuno", "Niente: il file lo porta chi lo scarica", "0 €", "Standard RFC 5545",
                controlli = listOf(ctr(ora(0, 6, 0), true, 12, "File di prova valido"))),
            integ("calendario", "Calendario: abbonamento dal telefono", "Un indirizzo che ICSx⁵ legge ogni ora e mette nel calendario del telefono, in casa", "collegati", "collegato", ora(0, 9, 40), 38,
                "Letto dal telefono di Manuel con ICSx⁵ · 2 indirizzi", "nessun account", "Niente fuori dal NAS: il telefono legge in casa",
                "0 € (ICSx⁵: 0 € da F-Droid, circa 2 € dal Play Store)", "Formato ICS, standard RFC 5545",
                controlli = listOf(ctr(ora(0, 9, 40), true, 38, "Letto da ICSx⁵"), ctr(ora(0, 8, 40), true, 41, "Letto da ICSx⁵")))
                .put("impostazioni", JSONObject().put("CALENDARIO_GIORNI_PRIMA", 30).put("CALENDARIO_MESI_DOPO", 12).put("CALENDARIO_PUBBLICO", false)),
            integ("ricerca", "Cerca dentro i file", "Cerca nel testo di PDF, Word, Excel e DXF", "collegati", "collegato", ora(0, 2, 52), 0,
                "1.240 file letti · 37 senza testo · 2 da leggere", "nessun account", "Niente: il testo resta nel database del NAS", "0 €", "Nessun servizio esterno",
                controlli = listOf(ctr(ora(0, 2, 52), true, 0, "14 file letti"), ctr(ora(-1, 2, 50), true, 0, "9 file letti")))
                .put("impostazioni", JSONObject().put("RICERCA_FILE", true).put("RICERCA_FILE_MAX_MB", 20)),
            integ("porta", "Accesso da fuori casa (porta Google)", "Telefoni e computer dello studio entrano da fuori casa passando dallo script del foglio", "collegati", "da_configurare",
                esito = "Spenta nel .env del NAS: si accende quando lo script del foglio ha Porta.gs", account = "il Gmail del foglio di Wisper",
                esce = "Le richieste delle app passano da Google; a casa nessuna porta aperta", costo = "0 €", regole = "Google"),
            integ("portale", "Portale su internet", "I clienti entrano nel portale da internet", "collegati", "da_configurare",
                esito = "Mancano l'indirizzo dello script del portale e il suo segreto nel .env del NAS", account = "il Gmail del foglio di Wisper e Netlify",
                esce = "Le pagine e i documenti pubblicati per ogni cliente, passando da Google", costo = "0 € (Netlify gratuito, script Google)", regole = "Google, Netlify"),
            integ("link", "Link che scade per i documenti", "Un documento al cliente con un link di 14 giorni", "collegati", "da_configurare",
                esito = "Si accende col portale", account = "come il portale", esce = "Il documento scelto", costo = "0 €", regole = "come il portale"),
            integ("ponte", "Ponte per le versioni vecchie", "Nelle settimane del cambio le app 0.4.0 lavorano col server", "collegati", "da_configurare",
                esito = "Si accende la sera del cambio con PONTE_PORTA nello script del foglio", account = "il Gmail del foglio di Wisper",
                esce = "Solo le richieste delle app vecchie, dalla coda della porta Google", costo = "0 €", regole = "Google"),
            integ("calendariopubblico", "Calendario anche fuori casa (Google Calendar, Outlook)", "Gli impegni di Wisper in Google Calendar e in Outlook", "scelta", "dipende",
                esce = "Titoli e luoghi degli appuntamenti (di base senza dettagli)", costo = "0 €", regole = "Google, Microsoft",
                perche = "Li leggono i server di Google e Microsoft: l'indirizzo passa dallo script del portale", servirebbe = "Il portale acceso e l'interruttore del calendario fuori casa"),
            integ("onedrive", "Sfogliare OneDrive e SharePoint", "Scegliere i file di OneDrive da dentro Wisper", "scelta", "dipende", esce = "Niente in più: Wisper legge", costo = "0 €", regole = "Microsoft",
                perche = "Servirebbe un'app nel Microsoft 365 di Manuel e una chiave sul NAS che legge i suoi file. I link incollati funzionano già.",
                servirebbe = "App in Microsoft Entra, consenso di un amministratore, chiave da rinnovare ogni 90 giorni"),
            integ("drive", "Sfogliare Google Drive", "Scegliere i file di Drive da dentro Wisper", "scelta", "dipende", esce = "Niente in più: Wisper legge", costo = "0 €", regole = "Google",
                perche = "Servirebbe un progetto Google Cloud e il selettore di Google, che è una pagina web. I link incollati funzionano già.", servirebbe = "Progetto Google Cloud, verifica dell'app"),
            integ("programmafatture", "Programma delle fatture di Manuel", "La bozza nasce nel programma invece di copiarla", "scelta", "dipende", esce = "La bozza della fattura",
                costo = "di solito compreso nel suo piano", regole = "del programma", perche = "Prima bisogna sapere quale programma usa Manuel", servirebbe = "Il nome del programma e la sua API"),
            integ("postams", "Email dalla posta di Manuel", "Le email di Wisper partono dalla casella Microsoft 365 di Manuel", "scelta", "dipende", esce = "Email e PDF ai clienti",
                costo = "0 € in più · 10.000 destinatari al giorno", regole = "Microsoft", perche = "Dipende dal consulente privacy e da una chiave che manda posta a nome dello studio",
                servirebbe = "App in Microsoft Entra col permesso di mandare posta"),
            integ("workspace", "Google Workspace", "Il postino su un account con l'accordo sul trattamento dei dati", "scelta", "dipende", esce = "come il postino",
                costo = "6,80 € a utente al mese (annuale) o 8,10 € (flessibile)", regole = "Google", perche = "Dipende dal consulente privacy", servirebbe = "Spostare foglio e script su un account Workspace"),
            integ("duevie", "Calendario a due vie", "Scrivere in Wisper anche dal calendario di Google o Outlook", "noncollegati", "non_collegato", costo = "0 €",
                perche = "Vorrebbe un indirizzo su internet per gli avvisi e due calendari che si scrivono a vicenda. Si scrive solo in Wisper.",
                servirebbe = "App registrate da Google e Microsoft, verifica di Google, regole per i conflitti"),
            integ("sdi", "Invio allo SDI", "Mandare le fatture all'Agenzia delle Entrate da Wisper", "noncollegati", "non_collegato",
                costo = "Aruba circa 30 € l'anno più il Premium; Openapi circa 0,10-0,15 € a fattura", perche = "Le fatture le emette il programma di Manuel: Wisper le prepara",
                servirebbe = "Un intermediario e la numerazione fiscale in Wisper"),
            integ("openbanking", "Movimenti della banca", "Leggere i movimenti del conto", "noncollegati", "non_collegato", costo = "Da 0 € (solo i propri conti) a un contratto",
                perche = "Banche e scadenze è solo scadenziario: incassi e pagamenti si segnano a mano", servirebbe = "Un fornitore autorizzato a leggere i conti; il consenso si rifà ogni 180 giorni"),
            integ("estrattoconto", "Importa l'estratto conto", "Leggere il file dei movimenti della banca", "noncollegati", "non_collegato", costo = "0 €",
                perche = "Banche e scadenze è solo scadenziario", servirebbe = "Il file della banca (CSV o CBI)"),
            integ("whatsappapi", "WhatsApp Business dal server", "Messaggi mandati e ricevuti da Wisper", "noncollegati", "non_collegato", costo = "circa 0,036 $ a promemoria",
                perche = "I messaggi li manda Manuel dal suo WhatsApp: Wisper li prepara", servirebbe = "Un numero sulla piattaforma di Meta, modelli approvati, un indirizzo su internet"),
            integ("messaggi", "Ore e spese via messaggio", "Scrivere ore e spese in chat", "noncollegati", "non_collegato", costo = "WhatsApp come sopra; Telegram 0 €",
                perche = "L'app lo fa già in meno di un minuto, anche senza rete", servirebbe = "WhatsApp dal server o un bot Telegram"),
            integ("assistente", "Assistente operativo", "Domande sul gestionale scritte a parole", "noncollegati", "non_collegato", costo = "circa 1-1,5 $ al mese per 500 domande",
                perche = "I dati dei clienti andrebbero fuori dall'Europa; un modello sul NAS è troppo lento", servirebbe = "Un modello in rete e un accordo sui dati"),
            integ("firebase", "Notifiche immediate", "Avvisi sul telefono nello stesso istante", "noncollegati", "non_collegato", costo = "0 €",
                perche = "Il telefono controlla ogni 15 minuti: basta, senza progetti Google né chiavi", servirebbe = "Un progetto Firebase e una chiave sul NAS"),
            integ("paghe", "Programma paghe del consulente", "Mandare presenze e assenze al consulente", "noncollegati", "non_collegato", costo = "0 €",
                perche = "Non esiste un formato comune: si esporta il file per il consulente", servirebbe = "Un formato comune"),
            integ("durc", "DURC On Line e Ispettorato", "Scaricare il DURC, comunicare gli occasionali", "noncollegati", "non_collegato", costo = "0 €",
                perche = "Si entra solo con SPID, CIE o CNS: un programma non può", servirebbe = "Un accesso per i programmi, che non c'è"),
        )
    }

    // -------------------------------------------------- calendario (§5)

    private fun feed(id: Int, nome: String, attivita: String, assenze: Boolean, ultimo: String, agente: String, letture: Int, di: String = "Manuel Gasparotto") =
        JSONObject().put("id", id).put("nome", nome).put("cosa", JSONObject().put("attivita", attivita).put("assenze", assenze).put("scadenze", false))
            .put("dettagli", true).put("pubblico", false).put("creato", ora(-10, 10, 5)).put("ultimoUso", ultimo).put("agente", agente).put("letture", letture).put("utente", di)

    private val feed = listOf(
        feed(1, "Telefono di Manuel", "mie", true, ora(0, 9, 40), "ICSx5/2.4.3", 214),
        feed(2, "Outlook in ufficio", "studio", false, "", "", 0),
    )

    /** Un file .ics di esempio (RFC 5545), solo per far vedere Condividi nella visita. */
    private fun ics(): String {
        val g = oggi.plusDays(1).toString().replace("-", "")
        return listOf(
            "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Studio Tecnico GM//Wisper//IT", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
            "X-WR-CALNAME:Wisper · esempio", "BEGIN:VEVENT", "UID:attivita-31-$g@wisper", "DTSTAMP:${g}T080000Z",
            "DTSTART;TZID=Europe/Rome:${g}T090000", "DTEND;TZID=Europe/Rome:${g}T110000", "SUMMARY:Intervento TK/2026/0014: Scatta il generale MT",
            "LOCATION:Cabina MT di Zanè\\, Zanè (VI)", "DESCRIPTION:Esempio della visita guidata.\\nSi cambia in Wisper\\, non qui.", "STATUS:CONFIRMED", "TRANSP:OPAQUE",
            "END:VEVENT", "END:VCALENDAR",
        ).joinToString("\r\n", postfix = "\r\n")
    }

    // -------------------------------------------------- amministrazione (§9, prototipo IMPOST, FUNZ, CTRL)

    private fun voce(chiave: String, etichetta: String, tipo: String, valore: Any?, unita: String = "", min: Int? = null, max: Int? = null, scelte: List<Pair<String, String>> = emptyList()) =
        JSONObject().put("chiave", chiave).put("etichetta", etichetta).put("tipo", tipo).put("valore", valore ?: JSONObject.NULL).put("unita", unita)
            .put("min", min ?: JSONObject.NULL).put("max", max ?: JSONObject.NULL)
            .put("scelte", JSONArray().apply { scelte.forEach { (k, n) -> put(JSONArray().put(k).put(n)) } })

    private fun col(nome: String, pagina: String, sezione: String, valore: String) = JSONObject().put("nome", nome).put("pagina", pagina).put("sezione", sezione).put("valore", valore)

    private fun gruppo(chiave: String, nome: String, voci: List<JSONObject>, collegamenti: List<JSONObject> = emptyList()) =
        JSONObject().put("chiave", chiave).put("nome", nome).put("voci", arr(voci)).put("collegamenti", arr(collegamenti))

    private val impostazioni = listOf(
        gruppo("lavoro", "Lavoro e approvazioni", listOf(
            voce("APPROVAZIONE", "Cosa va approvato", "scelta", "collaboratori", scelte = listOf("collaboratori" to "Le cose dei collaboratori", "tutti" to "Tutto", "nessuno" to "Niente")),
            voce("ORE_GIORNALIERE", "Ore di lavoro al giorno", "numero", 8, "ore", 1, 12),
            voce("FESTA_PATRONO", "Santo patrono", "testo", "07-07"),
        )),
        gruppo("rimborsi", "Rapportini e rimborsi", listOf(
            voce("EURO_KM", "Prezzo al km per il cliente", "numero", 0.76, "€", 0, 5),
            voce("COSTO_ORARIO", "Costo orario dello studio", "numero", 28, "€/h", 0, 500),
            voce("INDENNITA_TRASFERTA", "Indennità di trasferta al giorno", "numero", null, "€", 0, 200),
        ), listOf(col("Veicoli e rimborso km", "amministrazione", "veicoli", "Tabelle ACI ${oggi.year}"))),
        gruppo("preventivi", "Preventivi", listOf(voce("PREVENTIVO_VALIDITA_GIORNI", "Un preventivo vale", "numero", 30, "giorni", 1, 365)),
            listOf(col("Condizioni e testi", "documenti", "modelli", "Documenti › Modelli"))),
        gruppo("fisco", "Fatture e banca", listOf(voce("SOGLIA_CASSA", "Saldo sotto cui il giorno è rosso", "numero", 3000, "€", 0, 1000000)),
            listOf(col("Impostazioni fiscali", "amministrazione", "fiscale", "Da confermare col commercialista"), col("Conti", "banche", "conti", "Banche e scadenze"))),
        gruppo("documenti", "Documenti e file", listOf(
            voce("FILE_MAX_MB", "Grandezza massima di un file", "numero", 50, "MB", 1, 200),
            voce("EMAIL_ALLEGATI_MAX_MB", "Allegati per email al massimo", "numero", 15, "MB", 1, 25),
            voce("COPIA_INVIATI", "Tieni una copia dei PDF mandati", "si", true),
            voce("PREAVVISO_GIORNI", "Preavviso proposto delle scadenze", "numero", 60, "giorni", 1, 365),
            voce("CONDIVISIONE_GIORNI", "Un link per i clienti dura", "numero", 14, "giorni", 1, 90),
        )),
        gruppo("ticket", "Ticket e assistenza", listOf(
            voce("TICKET_TEMPI", "Tempi dei ticket, in ore", "tempi", JSONObject()
                .put("urgente", JSONObject().put("presa", 1).put("intervento", 4)).put("alta", JSONObject().put("presa", 2).put("intervento", 24))
                .put("normale", JSONObject().put("presa", 8).put("intervento", 72)).put("bassa", JSONObject().put("presa", 24).put("intervento", 240))),
            voce("ANTICIPO_TICKET_GIORNI", "Il ticket programmato nasce prima della scadenza di", "numero", 30, "giorni", 1, 120),
        )),
        gruppo("persone", "Persone, mezzi e collaboratori", listOf(
            voce("TARATURA_MESI", "Taratura proposta ogni", "numero", 12, "mesi", 1, 60),
            voce("TARATURA_PREAVVISO_GIORNI", "Preavviso delle tarature", "numero", 30, "giorni", 1, 180),
            voce("TARATURA_BLOCCO", "Con la taratura scaduta", "scelta", "avviso", scelte = listOf("avviso" to "Avviso e conferma", "blocco" to "Non si usa")),
            voce("DURC_GIORNI", "Un DURC vale", "numero", 120, "giorni", 30, 365),
        )),
        gruppo("portale", "Portale clienti", listOf(
            voce("PORTALE_LINK_MINUTI", "Link e codice valgono", "numero", 10, "minuti", 5, 60),
            voce("PORTALE_EMAIL_GIORNO", "Email lasciate allo studio", "numero", 20, "al giorno", 0, 100),
        ), listOf(col("Spegni il portale adesso", "amministrazione", "portale", "Portale clienti"))),
        gruppo("comunicazioni", "Comunicazioni", listOf(
            voce("WHATSAPP_APP", "WhatsApp sul telefono", "scelta", "chiedi", scelte = listOf("business" to "Business", "normale" to "Normale", "chiedi" to "Chiedi")),
            voce("PROMEMORIA_GIORNI_PRIMA", "Promemoria degli appuntamenti", "numero", 1, "giorno lavorativo prima", 0, 7),
            voce("SOLLECITO_GIORNI", "Primo promemoria di pagamento dopo", "numero", 7, "giorni", 1, 90),
        )),
        gruppo("copie", "Spazio e copie", listOf(
            voce("SPAZIO_AVVISO_MB", "Avviso con lo spazio libero sotto", "numero", 10240, "MB", 100, 1000000),
            voce("SPAZIO_MINIMO_MB", "Niente documenti nuovi sotto", "numero", 2048, "MB", 100, 1000000),
            voce("COPIA_FUORI_MAX_MB", "File più grandi restano solo sul NAS oltre", "numero", 25, "MB", 1, 25),
            voce("PROVA_COPIA_GIORNI", "Prova automatica della copia ogni", "numero", 30, "giorni", 7, 90),
            voce("PROVA_RIPRISTINO_GIORNI", "Ripristino a mano ogni", "numero", 90, "giorni", 30, 365),
            voce("ESPORTAZIONI_GIORNI", "Il file con tutti i dati resta", "numero", 7, "giorni", 1, 30),
            voce("WISPER_ORA_COPIA", "Ora della copia", "sola", "2:30 (si cambia sul NAS)"),
        )),
        gruppo("calricerca", "Calendario e ricerca", listOf(
            voce("CALENDARIO_GIORNI_PRIMA", "Giorni passati nel calendario", "numero", 30, "giorni", 0, 365),
            voce("CALENDARIO_MESI_DOPO", "Mesi futuri nel calendario", "numero", 12, "mesi", 1, 36),
            voce("RICERCA_FILE", "Cerca anche dentro i file", "si", true),
            voce("RICERCA_FILE_MAX_MB", "Grandezza massima di un file da leggere", "numero", 20, "MB", 1, 100),
        )),
    )

    /** Come FUNZIONI di server/src/azioni/amministrazione8.js (03/11/2026: si spengono tutte, con le dipendenze). */
    private fun funz(modulo: String, nome: String, richiede: List<String>, cosa: String) =
        JSONObject().put("modulo", modulo).put("nome", nome).put("accesa", true).put("spegnibile", true).put("cosaCambia", cosa)
            .put("richiede", JSONArray(richiede))

    private val funzioni: List<JSONObject> by lazy {
        val l = listOf(
            funz("dashboard", "Dashboard", emptyList(), "Sparisce dal menu di tutti: Wisper si apre sulla prima voce accesa. I dati restano."),
            funz("clienti", "Clienti e fornitori", emptyList(), "Sparisce dal menu di tutti; non si creano clienti nuovi. I dati restano."),
            funz("commesse", "Commesse", listOf("clienti"), "Sparisce dal menu di tutti; i rapportini non chiedono più la commessa. I dati restano."),
            funz("progetti", "Progetti", listOf("commesse", "clienti"), "Sparisce dal menu di tutti; i rapportini non chiedono più il progetto. I dati restano."),
            funz("preventivi", "Preventivi", listOf("clienti"), "Sparisce dal menu di tutti. I dati restano."),
            funz("attivita", "Attività e calendario", emptyList(), "Sparisce dal menu di tutti; niente promemoria delle attività. I dati restano."),
            funz("rapportini", "Ore e rapportini", listOf("clienti"), "Sparisce dal menu di tutti; non si scrivono rapportini né ore. I dati restano."),
            funz("spese", "Spese e trasferte", emptyList(), "Sparisce dal menu di tutti. I dati restano."),
            funz("fatturazione", "Fatturazione", listOf("clienti"), "Sparisce dal menu di tutti. I dati restano."),
            funz("banche", "Banche e scadenze", emptyList(), "Sparisce dal menu di tutti. Segnare un incasso da una fattura funziona lo stesso. I dati restano."),
            funz("persone", "Persone", emptyList(), "Sparisce dal menu di tutti. I dati restano."),
            funz("documenti", "Documenti", emptyList(), "Sparisce dal menu di tutti. I dati restano."),
            funz("ticket", "Ticket e assistenza", listOf("clienti"), "Sparisce dal menu di tutti. I dati restano."),
            funz("mezzi", "Mezzi e attrezzature", emptyList(), "Sparisce dal menu di tutti. Nei rapportini non si scelgono più gli strumenti. I dati restano."),
            funz("comunicazioni", "WhatsApp e comunicazioni", listOf("clienti"), "Sparisce dal menu di tutti; niente proposte di messaggi. La campanella apre lo stesso le notifiche. I dati restano."),
            funz("portale", "Portale clienti", listOf("clienti"), "Sparisce dal menu di tutti e il portale si spegne subito per i clienti. I dati restano."),
            funz("collaboratori", "Collaboratori esterni", listOf("commesse", "clienti"), "Sparisce dal menu di tutti; gli esterni non vedono più le loro cose. I dati restano."),
            funz("integrazioni", "Integrazioni", emptyList(), "Sparisce dal menu di tutti; i collegamenti già fatti continuano a lavorare. I dati restano."),
            funz("amministrazione", "Amministrazione", emptyList(), "Sparisce dal menu di tutti; al titolare resta Funzioni, per riaccenderla. I dati restano."),
        )
        // serveA: chi ha bisogno di questa (anche passando da un'altra), come chiLaUsa() del server.
        l.forEach { f ->
            val m = f.getString("modulo")
            f.put("serveA", JSONArray(l.filter { g -> (0 until g.getJSONArray("richiede").length()).any { g.getJSONArray("richiede").getString(it) == m } }.map { it.getString("modulo") }))
        }
        l
    }

    private fun disp(persona: String, nome: String, app: String, ultimo: String, vecchio: Boolean = false) =
        JSONObject().put("persona", persona).put("nome", nome).put("app", app).put("ultimoUso", ultimo).put("vecchio", vecchio)

    private val dispositivi = listOf(
        disp("Manuel Gasparotto", "Telefono di Manuel", "telefono 0.9.0", ora(0, 9, 58)),
        disp("Manuel Gasparotto", "PC dello studio", "computer 0.9.0", ora(0, 8, 12)),
        disp("Laura Bianchi", "Portatile di Laura", "computer 0.9.0", ora(-1, 17, 40)),
        disp("Marco Rossato", "Telefono di Marco", "telefono 0.8.2", ora(0, 9, 15), vecchio = true),
        disp("Paola Rossi", "PC dello studio Rossi", "computer 0.9.0", ora(-80, 10, 0)),
    )

    private fun ctrl(chiave: String, testo: String, tipo: String, chi: String, stato: String, il: String = "", nota: String = "") =
        JSONObject().put("chiave", chiave).put("testo", testo).put("tipo", tipo).put("chi", chi).put("stato", stato).put("il", il).put("nota", nota)
            .put("utente", if (stato == "fatto" && tipo != "server") "Andrea Gasparotto" else "")

    private val controlli: List<Pair<String, List<JSONObject>>> by lazy {
        val f = oggi.minusDays(2).toString()
        listOf(
            "01 Dashboard" to listOf(
                ctrl("M01.1", "Ogni ruolo vede le sue voci e i suoi quattro riquadri; una cosa, una voce; tetti e Tutto quello che c'è da fare", "automatica", "Andrea", "fatto", f, "controlli-finali.html: 1.204 prove, 0 fallite"),
                ctrl("M01.2", "Ogni voce apre la pagina giusta già filtrata", "automatica", "Andrea", "fatto", f),
            ),
            "02 Clienti e fornitori" to listOf(
                ctrl("M02.1", "Nuovo, cambia, archivia e ripristina; doppione per nome e partita IVA; Controlla la partita IVA", "automatica", "Andrea", "fatto", f),
                ctrl("M02.2", "Importa da un file CSV ed Excel: nuovi, già presenti, da sistemare; Archivia quelli importati", "automatica_a_mano", "Andrea", "da_fare"),
            ),
            "03 Commesse" to listOf(
                ctrl("M03.1", "Codice che continua; formato cambiato senza ricodificare; prestazioni; duplica come modello; archivia", "automatica", "Andrea", "fatto", f),
                ctrl("M03.2", "Costi e margine uguali alla 0.4.0 coi dati della prova generale", "prova_generale", "Andrea e Manuel", "da_fare"),
            ),
            "05 Attività e calendario" to listOf(
                ctrl("M05.2", "Il file importato in Google Calendar e nel classico Outlook; ICSx⁵ sull'emulatore che si aggiorna", "a_mano", "Andrea", "da_fare"),
            ),
            "08 Fatturazione" to listOf(
                ctrl("M08.2", "Regole fiscali confermate dal commercialista", "server", "", "non_va", nota = "Non ancora confermate"),
                ctrl("M08.3", "Il prospetto passato al programma di Manuel e l'XML emesso tornato in Wisper", "a_mano", "Manuel", "da_fare"),
            ),
            "15 Portale clienti" to listOf(
                ctrl("M15.2", "Dal telefono in 4G: la pagina del portale su Netlify si apre e risponde; il NAS non ha porte aperte", "a_mano", "Andrea", "attesa", nota = "In attesa finché il portale non è acceso"),
            ),
            "17 Integrazioni" to listOf(ctrl("M17.1", "Nessuna integrazione in Errore", "server", "", "non_va", nota = "Errore: Verifica della partita IVA")),
            "18 Amministrazione" to listOf(ctrl("M18.1", "Dati dello studio completi (partita IVA, codice fiscale, indirizzo, albo, polizza)", "server", "", "fatto")),
            "Permessi" to listOf(
                ctrl("T01", "Ogni azione del server ha modulo e livello dichiarati", "automatica", "Andrea", "fatto", f),
                ctrl("T03", "Le quattro persone di prova provano a mano telefono e computer", "a_mano", "Andrea", "da_fare"),
            ),
            "Senza rete" to listOf(ctrl("T04", "Telefono in modalità aereo: coda, letture, Serve la rete", "a_mano", "Andrea", "da_fare")),
            "Tema scuro" to listOf(ctrl("T05", "Ogni schermata in chiaro e in scuro confrontata coi prototipi", "a_mano", "Andrea", "da_fare")),
            "Sicurezza" to listOf(ctrl("T11", "Il server interno non è su internet; copia fuori casa cifrata; password iniziali", "server", "", "non_va", nota = "Copia fuori casa non cifrata")),
            "Copie" to listOf(
                ctrl("T13", "Ultima copia riuscita nelle ultime 26 ore; prova automatica degli ultimi 30 giorni", "server", "", "fatto"),
                ctrl("T14", "Ripristino a mano negli ultimi 90 giorni", "server", "", "non_va", nota = "Ultimo 92 giorni fa"),
            ),
            "Il cambio" to listOf(
                ctrl("C01", "Seconda prova generale: Tutto torna e i 10 controlli", "prova_generale", "Andrea e Manuel", "da_fare"),
                ctrl("C02", "Code.gs col ponte incollato, Nuova versione del deployment", "a_mano", "Andrea", "da_fare"),
                ctrl("C03", "Riepiloghi del mese mandati, niente in coda sul telefono", "a_mano", "Manuel", "da_fare"),
            ),
        )
    }

    // -------------------------------------------------- documenti: come è stato letto un file (§6.3)

    private fun lettura(idFile: String): JSONObject = when (idFile) {
        "esempio3" -> JSONObject().put("stato", "senza_testo")
        else -> JSONObject().put("stato", "letto").put("caratteri", 18420).put("pagine", 12).put("letto", ora(-4, 16, 40))
    }

    // -------------------------------------------------- la Dashboard intera (Tutto quello che c'è da fare)

    private fun voceJson(v: VoceDashboard) = JSONObject().put("tipo", v.tipo).put("titolo", v.titolo).put("dettaglio", v.dettaglio).put("quanto", v.quanto ?: JSONObject.NULL)
        .put("gravita", v.gravita).put("unita", v.unita).put("oggetto", v.oggetto).put("famiglia", v.famiglia).put("area", v.area).put("nascondibile", v.nascondibile)
        .put("collegamento", v.collegamento?.let { c ->
            JSONObject().put("pagina", c.pagina).put("id", c.id).apply {
                if (c.parametri.isNotEmpty()) put("filtro", JSONObject().apply { c.parametri.forEach { (k, x) -> put(k, x) } }) else if (c.filtro.isNotBlank()) put("filtro", c.filtro)
            }
        } ?: JSONObject.NULL)

    override suspend fun leggiAzione(azione: String, parametri: List<Pair<String, String>>): JSONObject {
        val p = parametri.toMap()
        val ok = JSONObject().put("ok", true)
        return when (azione) {
            "integrazioni" -> ok.put("integrazioni", arr(integrazioni.map { JSONObject(it.toString()).apply { remove("controlli") } }))
            "integrazione" -> ok.put("integrazione", integrazioni.firstOrNull { it.optString("chiave") == p["chiave"] } ?: throw PonteServer.Rifiutato("Collegamento non trovato"))
            "feedCalendario" -> ok.put("feed", arr(feed)).put("calendarioPubblico", false)
            "esportaCalendario" -> ok.put("nome", "wisper-calendario-esempio-$oggi.ics").put("mime", "text/calendar;charset=utf-8").put("eventi", 1)
                .put("base64", Base64.getEncoder().encodeToString(ics().toByteArray(Charsets.UTF_8)))
            "letturaFile" -> ok.put("ok", true).also { o -> lettura(p["idFile"].orEmpty()).let { l -> l.keys().forEach { k -> o.put(k, l.get(k)) } } }
            "esportazioni" -> ok.put("esportazioni", JSONArray())
            "importazioni" -> ok.put("importazioni", arr(listOf(JSONObject().put("id", 3).put("nomeFile", "clienti-fatture.csv").put("quando", ora(-7, 11, 20))
                .put("righe", 52).put("nuovi", 42).put("completati", 7).put("saltati", 3).put("archiviatiIl", ""))))
            "dashboard" -> {
                val (u, s, pi) = vociTutte()
                ok.put("urgenti", arr(u.map(::voceJson))).put("settimana", arr(s.map(::voceJson))).put("pianificare", arr(pi.map(::voceJson)))
                    .put("quante", JSONObject().put("urgenti", u.size).put("settimana", s.size).put("pianificare", pi.size)).put("nascoste", 0)
            }
            "impostazioniGenerali" -> ok.put("gruppi", arr(impostazioni))
            "funzioni" -> ok.put("funzioni", arr(funzioni))
            "notifichePreferenze" -> ok.put("telefono", true).put("silenzioSera", true).put("tipi", JSONObject()
                .put("assegnato", true).put("da_mandare", true).put("richiesta_portale", true).put("messaggio_portale", true).put("file_portale", false)
                .put("preventivo_accettato", true).put("preventivo_rifiutato", true).put("rapportino_firmato", true)
                .put("integrazione_errore", true).put("copia_non_riuscita", true).put("ripristino_da_provare", true)
                .put("esportazione_pronta", true).put("importazione_finita", true))
            "sicurezza" -> ok.put("internetInterno", JSONObject().put("ok", true).put("ultimo", JSONObject.NULL)).put("copiaCifrata", false)
                .put("accessiSbagliati", JSONObject().put("giorni", 30).put("quanti", 3).put("blocchi", 0))
                .put("dispositiviFermi", arr(listOf(dispositivi.last())))
                .put("utentiFermi", JSONArray())
                .put("passwordIniziali", arr(listOf(JSONObject().put("idUtente", 3).put("nome", "Marco Rossato"))))
                .put("sessioneGiorni", 180).put("dispositivi", arr(dispositivi)).put("feed", arr(feed + feed(3, "Telefono di Marco", "mie", false, ora(0, 9, 15), "ICSx5/2.4.3", 96, "Marco Rossato")))
            "copie" -> ok.put("copie", arr(listOf(
                JSONObject().put("quando", ora(0, 2, 30)).put("nome", "wisper-${oggi.toString().replace("-", "")}.db").put("locale", "ok").put("fuori", "ok · 3 file").put("foglio", "ok").put("byte", 90177536),
                JSONObject().put("quando", ora(-1, 2, 30)).put("nome", "wisper-${oggi.minusDays(1).toString().replace("-", "")}.db").put("locale", "ok").put("fuori", "ok · 5 file").put("foglio", "ok").put("byte", 90177536),
                JSONObject().put("quando", ora(-21, 2, 30)).put("nome", "wisper-${oggi.minusDays(21).toString().replace("-", "")}.db").put("locale", "ok").put("fuori", "ok").put("foglio", "ok").put("byte", 88080384),
            ))).put("prove", arr(listOf(
                JSONObject().put("id", 7).put("tipo", "automatica").put("quando", ora(-21, 2, 45)).put("copia", "wisper-${oggi.minusDays(21).toString().replace("-", "")}.db").put("esito", "ok")
                    .put("integrita", "ok").put("conteggi", JSONObject().put("rapportini", JSONArray().put(1532).put(1532))).put("file", JSONObject().put("provati", 20).put("giusti", 20))
                    .put("fuori", JSONObject().put("md5", "giusto")),
                JSONObject().put("id", 2).put("tipo", "a_mano").put("quando", ora(-92, 18, 0)).put("copia", "wisper-${oggi.minusDays(93).toString().replace("-", "")}.db").put("esito", "ok").put("da", "drive").put("utente", "Andrea Gasparotto"),
            ))).put("prossimaProva", oggi.plusDays(9).toString())
            "statoSistema" -> ok.put("server", JSONObject().put("versione", "1.0.0").put("acceso", ora(-12, 7, 12)).put("schema", 8).put("node", "24.12.0").put("ora", ora(0, 10, 5)))
                .put("differenzaMinuti", 0)
                .put("database", JSONObject().put("mb", 86).put("integrita", "ok").put("controllato", ora(0, 2, 40)))
                .put("disco", JSONObject().put("liberoMb", 1887436.8).put("wisperMb", 2150.4))
                .put("lavori", arr(listOf(
                    JSONObject().put("nome", "Copia").put("quando", ora(0, 2, 30)).put("esito", "ok").put("nota", ""),
                    JSONObject().put("nome", "Foglio riscritto").put("quando", ora(0, 2, 31)).put("esito", "ok").put("nota", ""),
                    JSONObject().put("nome", "Copia fuori casa").put("quando", ora(0, 2, 31)).put("esito", "ok").put("nota", "3 file"),
                    JSONObject().put("nome", "Ricorrenze").put("quando", ora(0, 0, 5)).put("esito", "ok").put("nota", "14 nuove"),
                    JSONObject().put("nome", "Pulizie").put("quando", ora(0, 3, 0)).put("esito", "ok").put("nota", "212 notifiche vecchie tolte"),
                    JSONObject().put("nome", "Lettura dei file").put("quando", ora(0, 2, 52)).put("esito", "ok").put("nota", "14 letti"),
                    JSONObject().put("nome", "Controlli delle integrazioni").put("quando", ora(0, 8, 30)).put("esito", "errore").put("nota", "Verifica della partita IVA in Errore"),
                )))
                .put("versioni", JSONObject().put("ultime", JSONObject().put("telefono", "0.9.0").put("computer", "0.9.0")).put("dispositivi", arr(dispositivi)))
            "controlliFinali" -> {
                val tutte = controlli.flatMap { it.second }
                ok.put("riassunto", JSONObject().put("fatti", tutte.count { it.optString("stato") == "fatto" }).put("totale", tutte.size)
                    .put("nonVanno", tutte.count { it.optString("stato") == "non_va" }).put("attesa", tutte.count { it.optString("stato") == "attesa" }))
                    .put("gruppi", arr(controlli.map { (n, r) -> JSONObject().put("nome", n).put("righe", arr(r)) }))
            }
            else -> throw PonteServer.Rifiutato(esempio)
        }
    }

    override suspend fun scriviAzione(corpo: JSONObject): JSONObject = throw PonteServer.Rifiutato(esempio)
    override suspend fun file(id: String): Pair<ByteArray, String> = throw PonteServer.Rifiutato(esempio)
    override suspend fun carica(nome: String, mime: String, idFile: String, per: String, dati: ByteArray): JSONObject = throw PonteServer.Rifiutato(esempio)
}
