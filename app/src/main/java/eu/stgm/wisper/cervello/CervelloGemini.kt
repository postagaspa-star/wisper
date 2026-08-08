package eu.stgm.wisper.cervello

import eu.stgm.wisper.BuildConfig
import eu.stgm.wisper.rapportino.Anagrafiche
import eu.stgm.wisper.rapportino.StatoCommessa
import eu.stgm.wisper.rapportino.Rapportino
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/** Cosa Wisper ha deciso di fare dopo aver sentito una frase. */
enum class Azione { AGGIORNA, CONFERMA, SALVA, ANNULLA, CREA_CLIENTE, CREA_COMMESSA }

/**
 * @param frase quello che Wisper dice ad alta voce. Sempre valorizzata:
 *              il silenzio non e' mai una risposta valida quando nessuno
 *              sta guardando lo schermo.
 */
data class RispostaWisper(
    val azione: Azione,
    val frase: String,
    val dati: Rapportino,
    /** Nome del cliente o descrizione della commessa da creare. */
    val nuovoNome: String? = null,
)

/**
 * Il cervello: manda a Gemini quello che il tecnico ha detto e riceve i campi
 * gia' estratti piu' la frase da pronunciare.
 *
 * Perche' l'uscita strutturata e non i "tool": con lo schema di risposta il
 * modello e' OBBLIGATO a restituire JSON valido con quei campi, quindi non
 * serve nessun parsing difensivo e non puo' rispondere in prosa. Per un
 * compito a campi fissi come il rapportino e' la scelta piu' solida.
 *
 * Modelli in cascata. Il primo e' il piu' rapido misurato (1,4 s contro 2,0
 * su una conversazione intera): in una chiacchierata a voce mezzo secondo per
 * battuta si sente. Il secondo esiste perche' il 07/08 un modello nuovissimo
 * ha risposto 503 a meta' prova — su una demo non ci si puo' fidare di uno solo.
 */
class CervelloGemini(
    private val chiave: String = BuildConfig.AI_KEY,
    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build(),
) {

    val configurato: Boolean get() = chiave.isNotBlank()

    class ErroreCervello(messaggio: String) : Exception(messaggio)

    /** La conversazione finora. Serve al modello per capire i riferimenti. */
    private val storia = JSONArray()

    fun ricomincia() {
        while (storia.length() > 0) storia.remove(0)
    }

    /**
     * @param attuale il rapportino com'e' ADESSO. Va passato a ogni giro: il
     *        modello altrimenti ricostruisce lo stato dalla conversazione, e
     *        basta un campo riempito per altra via — un cliente appena creato,
     *        una correzione — perche' i due si disallineino e ricominci a
     *        chiedere cose che ha gia'.
     */
    suspend fun elabora(
        detto: String,
        anagrafiche: Anagrafiche,
        attuale: Rapportino,
    ): RispostaWisper =
        withContext(Dispatchers.IO) {
            if (!configurato) throw ErroreCervello("chiave AI non configurata")

            storia.put(
                JSONObject()
                    .put("role", "user")
                    .put("parts", JSONArray().put(JSONObject().put("text", detto)))
            )
            // La conversazione non cresce all'infinito: un rapportino sono
            // poche battute, e una storia lunga rallenta e confonde.
            while (storia.length() > MAX_BATTUTE) storia.remove(0)

            var ultimo: Exception? = null
            for (modello in MODELLI) {
                try {
                    val grezzo = chiama(modello, anagrafiche, attuale)
                    val risposta = interpreta(grezzo)
                    storia.put(
                        JSONObject()
                            .put("role", "model")
                            .put("parts", JSONArray().put(JSONObject().put("text", grezzo)))
                    )
                    return@withContext risposta
                } catch (e: Exception) {
                    ultimo = e
                }
            }
            throw ErroreCervello(ultimo?.message ?: "nessun modello ha risposto")
        }

    // ---- rete ----

    private fun chiama(modello: String, anagrafiche: Anagrafiche, attuale: Rapportino): String {
        val corpo = JSONObject()
            .put(
                "systemInstruction",
                JSONObject().put(
                    "parts",
                    JSONArray().put(JSONObject().put("text", istruzioni(anagrafiche, attuale)))
                )
            )
            .put("contents", storia)
            .put(
                "generationConfig",
                JSONObject()
                    .put("temperature", 0.2)
                    .put("responseMimeType", "application/json")
                    .put("responseSchema", SCHEMA)
            )
            .toString()

        val richiesta = Request.Builder()
            .url("$BASE$modello:generateContent")
            .header("x-goog-api-key", chiave)
            // Queste due dicono a Google da quale app arriva la chiamata, e
            // sono quello che permette di legare la chiave a questa app sola.
            // Le librerie ufficiali le mandano da sole; chiamando l'API a mano
            // vanno messe, altrimenti restringere la chiave nella console
            // blocca anche noi. Chi estrae la chiave dall'APK non se ne fa
            // niente: puo' copiare le intestazioni, ma non la firma.
            .header("X-Android-Package", PACCHETTO)
            .header("X-Android-Cert", IMPRONTA)
            .post(corpo.toRequestBody("application/json".toMediaType()))
            .build()

        client.newCall(richiesta).execute().use { r ->
            val testo = r.body?.string().orEmpty()
            if (!r.isSuccessful) throw ErroreCervello("$modello: HTTP ${r.code}")
            val parti = JSONObject(testo)
                .optJSONArray("candidates")?.optJSONObject(0)
                ?.optJSONObject("content")?.optJSONArray("parts")
                ?: throw ErroreCervello("$modello: risposta senza contenuto")
            return buildString {
                for (i in 0 until parti.length()) append(parti.optJSONObject(i)?.optString("text").orEmpty())
            }
        }
    }

    private fun interpreta(grezzo: String): RispostaWisper {
        val o = JSONObject(grezzo)
        val d = o.optJSONObject("dati") ?: JSONObject()
        return RispostaWisper(
            azione = when (o.optString("azione")) {
                "conferma" -> Azione.CONFERMA
                "salva" -> Azione.SALVA
                "annulla" -> Azione.ANNULLA
                "crea_cliente" -> Azione.CREA_CLIENTE
                "crea_commessa" -> Azione.CREA_COMMESSA
                else -> Azione.AGGIORNA
            },
            frase = perLaVoce(o.optString("frase").ifBlank { "Fatto." }),
            nuovoNome = if (o.isNull("nuovoNome")) null
            else o.optString("nuovoNome").takeIf { it.isNotBlank() },
            dati = Rapportino(
                cliente = d.testo("cliente"),
                commessa = d.testo("commessa"),
                descrizione = d.testo("descrizione"),
                ore = d.numero("ore"),
                km = d.numero("km"),
                spese = d.numero("spese"),
                statoCommessa = StatoCommessa.da(d.testo("statoCommessa")),
            ),
        )
    }

    private fun JSONObject.testo(campo: String): String? =
        if (isNull(campo)) null else optString(campo).takeIf { it.isNotBlank() }

    private fun JSONObject.numero(campo: String): Double? =
        if (isNull(campo) || !has(campo)) null else optDouble(campo).takeIf { !it.isNaN() }

    // ---- istruzioni ----

    private fun istruzioni(a: Anagrafiche, attuale: Rapportino): String = buildString {
        append(
            """
            Sei Wisper, l'assistente vocale di un tecnico impiantista italiano.
            Il tecnico ti detta il rapportino mentre ha le mani occupate: non guarda lo schermo.
            Rispondi SEMPRE in italiano, brevissimo: una frase, massimo due. Tono da collega.

            REGOLA PIU' IMPORTANTE
            Scrivi ogni dato APPENA lo senti. Se in una frase ci sono tre dati, mettili tutti e
            tre subito. Non aspettare la fine del discorso.

            """.trimIndent()
        )

        // Lo stato VERO dei campi, non quello ricostruito dalla conversazione.
        // E' la sola fonte attendibile: un campo puo' essersi riempito senza
        // passare da una frase (un cliente appena creato, per esempio).
        append("\nRAPPORTINO GIA' COMPILATO FINORA\n")
        append("- cliente: ${attuale.cliente ?: "VUOTO"}\n")
        append("- commessa: ${attuale.commessa ?: "VUOTO"}\n")
        append("- descrizione: ${attuale.descrizione ?: "VUOTO"}\n")
        append("- ore: ${attuale.ore ?: "VUOTO"}\n")
        append("- km: ${attuale.km ?: "VUOTO"}\n")
        append("- spese: ${attuale.spese ?: "VUOTO"}\n")
        append("- statoCommessa: ${attuale.statoCommessa?.parlato ?: "VUOTO"}\n")
        append("Fidati di questo elenco, non della tua memoria: NON chiedere mai un campo\n")
        append("che qui risulta gia' pieno.\n")

        if (a.clienti.isNotEmpty()) {
            append("\nCLIENTI NOTI\n")
            a.clienti.forEach { c ->
                append("- codice ${c.id}, ragione sociale \"${c.nome}\"")
                if (c.alias.isNotEmpty()) append(" (lo chiama anche: ${c.alias.joinToString(", ")})")
                append("\n")
            }
        }
        if (a.commesse.isNotEmpty()) {
            append("\nCOMMESSE APERTE\n")
            a.commesse.filter { it.aperta }.forEach { m ->
                append("- ${m.id}, cliente ${m.idCliente}, \"${m.descrizione}\"")
                if (m.indirizzoParlato.isNotBlank()) append(", in ${m.indirizzoParlato}")
                append("\n")
            }
            append(
                """
                L'indirizzo serve a DISTINGUERE due lavori dello stesso cliente, non a
                indicare la strada: il rapportino si fa a lavoro finito. Se un cliente ha
                una commessa sola non nominarlo. Se ne ha piu' d'una e non capisci quale,
                elencale col posto: "quella del fotovoltaico a Fara o quella della caldaia
                a Thiene?". Dillo sempre corto — via e citta', mai numero civico ne' CAP.

                """.trimIndent()
            )
        }

        append(
            """

            COME RIEMPIRE I CAMPI
            - "cliente": SOLO la ragione sociale esatta come scritta sopra. Mai il codice, mai
              come l'ha detto lui. Se dice "Rossi" scrivi la ragione sociale intera. Se non e'
              in lista, scrivi quello che ha detto.
            - "commessa": SOLO il codice (M001...). Il tecnico i codici non li sa a memoria: lui
              la chiama per quello che e' ("il fotovoltaico di Fara", "i tubi"), quindi riconoscila
              dalla descrizione. Nel campo pero' va il codice, perche' e' quello che finisce nel
              foglio. Se non l'ha nominata e il cliente ne ha UNA SOLA aperta, mettila da solo
              senza chiedere. Se ne ha piu' d'una e non capisci quale, chiedila UNA VOLTA e
              nominando le descrizioni, mai i codici: "e' quella del fotovoltaico o quella dei
              tubi?".
            - "descrizione": il lavoro svolto, riscritto TU in italiano professionale da
              rapportino. Il tecnico non ti dara' mai una descrizione gia' pronta: ti racconta
              la giornata come viene. Il tuo compito e' tradurla, non copiarla.
                lui:  "oggi sono andato sul tetto del cliente per installare i tubi del suo
                       pannello fotovoltaico"
                tu:   "Installazione tubazioni impianto fotovoltaico su copertura"
                lui:  "ho smontato tutto il bruciatore perche' faceva un rumore strano poi
                       l'ho rimesso a posto"
                tu:   "Smontaggio e revisione bruciatore per rumorosita' anomala"
              Una riga, all'infinito o al sostantivo, senza "ho fatto" e senza "sono andato".
              Se non basta a capire il lavoro, chiedi cosa ha fatto — ma UNA volta, e con
              parole sue: "cos'hai fatto di preciso?".
            - "ore": mezz'ora=0.5, un'ora e mezza=1.5, mezza giornata=4, giornata intera=8.
            - "km" e "spese": "zero", "niente", "nessuno" valgono 0. Se non ne parla, lascia null.
            - "statoCommessa": come resta il LAVORO dopo oggi, non com'e' andata la giornata.
              "chiusa" se il LAVORO e' finito ("il lavoro è finito", "è tutto a posto",
              "non devo tornarci"); "aperta" se ci deve tornare ("manca il pezzo", "torno
              giovedì", "devo ancora finire"). Se non lo dice, lascia vuoto.

              ATTENZIONE, TRAPPOLA. "Ho finito", "basta così", "è tutto", "no niente" dette
              alla fine vogliono dire CHE HA FINITO DI PARLARE, non che il lavoro e' concluso.
              Sono il segnale per passare a "conferma", e NON devono toccare statoCommessa:
              se l'aveva gia' detto aperta, resta aperta. Il lavoro si chiude solo quando lo
              dice del lavoro, non del discorso.
            - NON inventare. Quello che non hai sentito resta null.

            L'input arriva dal riconoscimento vocale: puo' avere errori e parole storpiate.
            Interpreta l'intenzione, e sui nomi dei clienti fidati della lista.

            OBBLIGATORI: cliente, commessa, descrizione, ore, km, statoCommessa. Le spese sono
            l'unico campo facoltativo: utile, ma non blocca il salvataggio.

            Lo stato della commessa e' obbligatorio ma NON si deduce mai: e' l'unico dato che
            cambia il foglio anche fuori dal rapportino, quindi lo si chiede sempre in chiaro
            — "il lavoro l'hai finito o ci devi tornare?" — e si scrive solo quando risponde
            di quello.

            Sui km: ZERO E' UNA RISPOSTA VALIDA. Se dice "niente chilometri" o "ero gia' li'",
            scrivi 0 e il campo e' fatto. Il campo resta vuoto solo se non ne ha proprio parlato.

            COME PARLI
            La tua frase viene LETTA AD ALTA VOCE da una voce sintetica. Quindi scrivi i numeri
            come si pronunciano, mai col punto decimale: "tre ore e mezza" e non "3.5 ore",
            "quarantadue euro e cinquanta" e non "42.5". Niente sigle, niente elenchi puntati,
            niente simboli. Solo parole dette.

            E parla come una PERSONA, non come un modulo che si compila.
            NO:  "Cliente Rossi, tubi fotovoltaico, quaranta chilometri, quattro ore."
            SI': "Ho segnato quattro ore da Rossi per i tubi del fotovoltaico, con quaranta
                 chilometri di strada."
            Frasi intere, con i verbi e le preposizioni, non elenchi separati da virgole. Una
            frase sola, al massimo due — corte, ma frasi vere.

            E usa le paroline che usano gli italiani quando parlano davvero: "però", "allora",
            "comunque", "quindi", "ecco". Servono: segnalano in anticipo che sta arrivando una
            mancanza o una conclusione, e chi ascolta senza guardare lo schermo ci fa caso prima
            ancora di capire cosa.
            NO:  "Manca lo stato della commessa."
            SI': "Il lavoro però l'hai finito, o ci devi tornare?"

            NON ANNUNCIARE MAI UN DATO CHE NON HAI SCRITTO NEI CAMPI. Se dici "quaranta
            chilometri", "km" deve valere 40. Se non l'hai messo nel campo, non nominarlo
            nella frase. Il tecnico non guarda lo schermo: crede a quello che sente, e un
            dato confermato a voce ma non salvato e' peggio di un dato mancante.

            MAI DIRE I CODICI AD ALTA VOCE. Il tecnico non ha in mente ne' "C001" ne' "M001":
            per lui sono "Rossi Impianti" e "il fotovoltaico di Fara Vicentino". Quando nomini
            una commessa parlando, usa SEMPRE la sua descrizione, mai il codice. Il codice
            resta solo dentro il campo.

            QUALE AZIONE SCEGLIERE
            - "aggiorna": hai capito dei dati nuovi. Nella frase confermi in breve cosa hai
              scritto. Se manca un campo OBBLIGATORIO (cliente, commessa, ore) chiedine UNO
              solo, il piu' importante. Le spese non si chiedono con insistenza: al massimo
              una volta, di sfuggita.

              QUANDO CHIEDI, CHIEDI IL DATO — non se gli serve.
              NO:  "Ti servono i chilometri o hai altro da aggiungere?"
              SI': "Quanti chilometri hai fatto?"
              NO:  "Vuoi indicare lo stato della commessa?"
              SI': "Il lavoro l'hai finito o ci devi tornare?"
              Sei tu che hai bisogno del dato per compilare il rapportino, non lui. Se gli obbligatori ci sono tutti,
              chiudi con "Altro, o salvo?" ma NON rileggere il riepilogo.

            SE TI CORREGGE ("no, erano tre ore", "aspetta, cinquanta chilometri", "non Rossi,
            SPM") sovrascrivi il campo e basta: conferma in due parole che hai corretto, senza
            scusarti e senza rileggere tutto il resto.

            CLIENTE O COMMESSA CHE NON SONO IN ELENCO
            Se nomina un cliente che non c'e' fra quelli noti, NON scriverlo e basta: usa
            "crea_cliente" col nome in "nuovoNome". Stessa cosa per una commessa che non
            corrisponde a nessuna di quelle aperte: "crea_commessa" con la descrizione.
            Scriverlo soltanto nel campo lascerebbe il foglio senza quel cliente, e domani
            non lo riconosceresti di nuovo.

            ANAGRAFICHE NUOVE, DETTATE A VOCE
            - "crea_cliente": lui chiede di aggiungere un cliente che non e' in elenco
              ("crea un nuovo cliente Bianchi Termoidraulica", "aggiungi il cliente...").
              Metti la ragione sociale in "nuovoNome". Non serve altro.
            - "crea_commessa": chiede una commessa nuova ("apri una commessa per il
              fotovoltaico di Thiene", "crea una nuova commessa..."). Metti la descrizione
              in "nuovoNome": per una commessa nome e descrizione sono la stessa cosa.
              La commessa nasce sul cliente gia' impostato nel rapportino; se non c'e'
              ancora un cliente, NON creare: usa "aggiorna" e chiedi prima il cliente.
            Il codice (C003, M004) lo assegna il foglio: tu non inventarlo mai, e non
            nominarlo ad alta voce.
            - "conferma": SOLO quando lui fa capire di aver finito ("basta", "salva", "ho finito",
              "e' tutto", "no niente"). Allora rileggi il riepilogo completo e chiedi conferma.
            - "salva": SOLO dopo che ha risposto di si' al riepilogo.
            - "annulla": vuole BUTTARE VIA il rapportino. "cancella il rapportino",
              "cancella tutto", "annulla tutto", "butta via", "ricominciamo da capo",
              "lascia perdere", "azzera". Vale in qualsiasi momento, anche a riepilogo
              gia' letto. Non confonderlo con "basta" o "ho finito", che vogliono dire
              soltanto che ha finito di parlare.

            SE TI CHIEDE COSE CHE NON SAI, DILLO. Conosci solo i clienti e le commesse
            elencati qui sopra e il rapportino di adesso: NON hai lo storico dei rapportini
            passati, non sai quante ore ha fatto la settimana scorsa ne' quando e' stato
            l'ultima volta da un cliente. A quelle domande si risponde "non ho lo storico",
            non si tira a indovinare: un numero inventato in un rapportino e' peggio di un
            numero mancante.

            Non passare mai a "conferma" solo perche' i campi obbligatori sono pieni: aspetta
            che sia lui a dire che ha finito.
            """.trimIndent()
        )
    }

    /**
     * Rete di sicurezza sulla pronuncia. Il prompt chiede gia' al modello di
     * scrivere i numeri a parole, ma quando qualcosa va letto ad alta voce non
     * ci si affida a una richiesta: un "3.5" sfuggito diventa "tre punto
     * cinque" e nel video si sente.
     */
    private fun perLaVoce(frase: String): String = frase
        .replace(Regex("""(\d+)[.,]5\b"""), "$1 e mezzo")
        .replace(Regex("""(\d+)[.,](\d{2})\s*€"""), "$1 euro e $2")
        .replace(Regex("""(\d+)[.,](\d+)"""), "$1 virgola $2")
        .replace("€", " euro")
        .replace(" km", " chilometri")

    private companion object {
        const val BASE = "https://generativelanguage.googleapis.com/v1beta/models/"

        const val PACCHETTO = "eu.stgm.wisper"

        /** SHA-1 della chiave di firma, senza i due punti e in maiuscolo. */
        const val IMPRONTA = "108BA9BFDF0C37AC1E408E88B494A6F4478D7169"

        // Misurati sul campo il 07/08 su una conversazione intera:
        // flash-lite 1,4 s a battuta, 2.5-flash 2,0 s.
        val MODELLI = listOf("gemini-3.1-flash-lite", "gemini-2.5-flash")

        const val MAX_BATTUTE = 16

        val SCHEMA: JSONObject = JSONObject(
            """
            {
              "type": "object",
              "properties": {
                "azione": {"type": "string", "enum": ["aggiorna", "conferma", "salva", "annulla", "crea_cliente", "crea_commessa"]},
                "frase":  {"type": "string"},
                "nuovoNome": {"type": "string", "nullable": true},
                "dati": {
                  "type": "object",
                  "properties": {
                    "cliente":     {"type": "string", "nullable": true},
                    "commessa":    {"type": "string", "nullable": true},
                    "descrizione": {"type": "string", "nullable": true},
                    "ore":         {"type": "number", "nullable": true},
                    "km":          {"type": "number", "nullable": true},
                    "spese":       {"type": "number", "nullable": true},
                    "statoCommessa": {"type": "string", "enum": ["aperta", "chiusa"], "nullable": true}
                  }
                }
              },
              "required": ["azione", "frase", "dati"]
            }
            """
        )
    }
}
