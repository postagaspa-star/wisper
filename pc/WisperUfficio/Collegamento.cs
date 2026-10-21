using System.Text.Json.Nodes;

namespace WisperUfficio;

/// <summary>
/// Il file "Collega Wisper Ufficio.wisper" che arriva per email quando dal telefono
/// si tocca "Collega il computer" (apps-script/Code.gs, collegaComputer). Dentro ci
/// sono indirizzo e codice del foglio: aprirlo collega il programma senza ricopiare
/// niente. Si apre con un doppio clic (l'installazione associa .wisper al programma)
/// o da Impostazioni, "Usa il file dell'email". Letto il file, lo si cancella: il
/// codice non deve restare in Download.
/// </summary>
public static class Collegamento
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
            try { info.Delete(); } catch (IOException) { /* resta, pazienza: lo dice l'email di cancellarlo */ }
            catch (UnauthorizedAccessException) { }
            Log.Info("collegato al foglio col file dell'email");
            return null;
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException or System.Text.Json.JsonException)
        {
            Log.Errore("file di collegamento illeggibile", e);
            return "Questo non è il file di collegamento di Wisper";
        }
    }

    /// <summary>Il contenuto del file: controlla e salva. Null se è andata.</summary>
    public static string? Usa(JsonObject? o, Configurazione config)
    {
        if (o == null || (string?)o["tipo"] != "wisper-collegamento") return "Questo non è il file di collegamento di Wisper";
        var url = ((string?)o["url"] ?? "").Trim();
        var codice = ((string?)o["codice"] ?? "").Trim();
        if (!IndirizzoValido(url) || codice.Length == 0) return "Il file di collegamento è rovinato: fattene mandare un altro dal telefono";
        config.Salva(url, codice);
        return null;
    }

    /// <summary>Solo l'indirizzo di uno script Google (o il finto Google delle prove).</summary>
    public static bool IndirizzoValido(string url) =>
        System.Text.RegularExpressions.Regex.IsMatch(url, @"^https://script\.google\.com/macros/s/[A-Za-z0-9_-]+/exec$")
        || System.Text.RegularExpressions.Regex.IsMatch(url, @"^http://(localhost|127\.0\.0\.1)(:\d+)?/exec$");
}
