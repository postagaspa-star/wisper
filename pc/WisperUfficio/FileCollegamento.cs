using System.Text.Json.Nodes;

namespace WisperUfficio;

/// <summary>
/// Il file "Collega Wisper Ufficio.wisper" che arriva per email quando dal telefono si
/// tocca "Collega il computer": dentro c'è l'indirizzo della porta Google (lo script del
/// foglio) e, se il telefono lo sa, quello del server di casa. Aprirlo collega il
/// programma senza ricopiare niente: col doppio clic (l'installazione associa .wisper al
/// programma) o dalla pagina di accesso, "Usa il file dell'email". Letto il file, lo si
/// cancella: l'indirizzo dello script non deve restare in Download.
///
/// Forma: {"tipo": "wisper-collegamento", "versione": 2, "google": "https://script.google.com/macros/s/…/exec",
/// "casa": "http://192.168.1.51:8400"}. Quella della 0.4 (versione 1: "url" = lo script, "codice")
/// va bene uguale: "url" è la stessa porta Google, e il codice non si legge.
/// </summary>
public static class FileCollegamento
{
    public const string Estensione = ".wisper";

    /// <summary>Collega il programma col file. Null se è andata, altrimenti cosa non va.</summary>
    public static string? Importa(string percorso, Configurazione config)
    {
        try
        {
            var info = new FileInfo(percorso);
            if (!info.Exists) return "Il file di collegamento non c'è più";
            if (info.Length > 10_000) return "Questo non è il file di collegamento di Wisper";
            var o = JsonNode.Parse(File.ReadAllText(percorso)) as JsonObject;
            var errore = Usa(o, config);
            if (errore != null) return errore;
            try { info.Delete(); }
            catch (IOException) { /* resta, pazienza: l'email dice di cancellarlo */ }
            catch (UnauthorizedAccessException) { }
            Log.Info("collegato col file dell'email");
            return null;
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException or System.Text.Json.JsonException or InvalidOperationException)
        {
            Log.Errore("file di collegamento illeggibile", e);
            return "Questo non è il file di collegamento di Wisper";
        }
    }

    /// <summary>Il contenuto del file: controlla e salva gli indirizzi. Null se è andata.</summary>
    public static string? Usa(JsonObject? o, Configurazione config)
    {
        if (o == null || Testo(o["tipo"]) != "wisper-collegamento") return "Questo non è il file di collegamento di Wisper";
        var scritto = Testo(o["google"]);
        if (scritto.Length == 0) scritto = Testo(o["url"]);
        var google = IndirizzoGoogle.Pulito(scritto);
        var casaScritta = Testo(o["casa"]);
        var casa = casaScritta.Length > 0 ? IndirizzoServer.Pulito(casaScritta) : null;
        if (google == null || (casaScritta.Length > 0 && casa == null)) return "Il file di collegamento è rovinato: fattene mandare un altro dal telefono";
        config.SalvaIndirizzi(casa, google);
        return null;
    }

    private static string Testo(JsonNode? n)
    {
        try { return n?.GetValue<string>()?.Trim() ?? ""; }
        catch (InvalidOperationException) { return ""; }
    }
}
