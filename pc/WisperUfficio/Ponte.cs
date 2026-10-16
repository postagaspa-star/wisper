using System.Diagnostics;
using System.Text.Json.Nodes;
using System.Web;

namespace WisperUfficio;

/// <summary>
/// L'accordo fra programma e interfaccia, sul modello di Pactum. La pagina è servita
/// da https://wisper.locale/ e chiama solo:
///   /locale/*   cose del computer (collegamento, PDF, file da scegliere)
///   /foglio/*   lo script del foglio, a cui il ponte aggiunge il codice
///   /file/{id}  una foto o una firma di Drive, tenuta in copia sul disco
/// Niente porte aperte sul computer: tutto passa dentro WebView2.
/// </summary>
public sealed class Ponte
{
    public const string Host = "wisper.locale";
    public const string Origine = "https://" + Host;

    private readonly Configurazione config;
    private readonly Foglio foglio;
    private readonly string cartellaFile;

    /// <summary>Dove finiscono i PDF: Documenti\Wisper.</summary>
    public string CartellaPdf { get; }

    /// <summary>Le cose che sa fare solo la finestra: stampare in PDF, scegliere un file, riaprirsi aggiornata.</summary>
    public interface IFinestra
    {
        Task<bool> StampaAsync(string html, string percorso);
        (string Nome, byte[] Dati)? ScegliFile(string filtro);
        void Riavvia();
    }

    public IFinestra? Finestra { get; set; }

    public Aggiornamenti? Aggiornamenti { get; set; }

    /// <summary>Le opzioni con cui è partito il programma: il riavvio dopo un aggiornamento le ripete.</summary>
    public IReadOnlyList<string> ArgomentiDiAvvio { get; set; } = Array.Empty<string>();

    public Ponte(Configurazione config, Foglio foglio, string cartellaFile, string cartellaPdf)
    {
        this.config = config;
        this.foglio = foglio;
        this.cartellaFile = cartellaFile;
        CartellaPdf = cartellaPdf;
    }

    public static bool ÈInterno(string? indirizzo) =>
        indirizzo == "about:blank" ||
        (Uri.TryCreate(indirizzo, UriKind.Absolute, out var u) && u.Scheme == Uri.UriSchemeHttps &&
         string.Equals(u.Host, Host, StringComparison.OrdinalIgnoreCase) && u.IsDefaultPort);

    /// <summary>Solo pagine web e posta si aprono fuori: niente file o programmi da un link.</summary>
    public static bool ApribileFuori(string? indirizzo) =>
        Uri.TryCreate(indirizzo, UriKind.Absolute, out var u) &&
        (u.Scheme == Uri.UriSchemeHttps || u.Scheme == Uri.UriSchemeHttp || u.Scheme == Uri.UriSchemeMailto);

    public static bool ÈApi(Uri uri) =>
        uri.AbsolutePath.StartsWith("/locale/", StringComparison.Ordinal) ||
        uri.AbsolutePath.StartsWith("/foglio/", StringComparison.Ordinal);

    public static bool ÈFile(Uri uri) => uri.AbsolutePath.StartsWith("/file/", StringComparison.Ordinal);

    /// <summary>
    /// Il file della cartella ui per un percorso ("/" = index.html), oppure null se il
    /// percorso prova a uscire dalla cartella.
    /// </summary>
    public static string? FileDellInterfaccia(string cartellaUi, string percorsoUrl)
    {
        string relativo;
        try
        {
            relativo = Uri.UnescapeDataString(percorsoUrl).TrimStart('/');
        }
        catch (UriFormatException)
        {
            return null;
        }
        if (relativo.Length == 0) relativo = "index.html";
        if (relativo.Contains('\\') || relativo.Contains(':') || relativo.Contains('\0')) return null;
        if (relativo.Split('/').Any(p => p is "" or "." or "..")) return null;
        var radice = Path.GetFullPath(cartellaUi).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
        var completo = Path.GetFullPath(Path.Combine(radice, relativo.Replace('/', Path.DirectorySeparatorChar)));
        return completo.StartsWith(radice, StringComparison.OrdinalIgnoreCase) ? completo : null;
    }

    /// <summary>
    /// Un file dell'interfaccia: dalla cartella ui accanto all'exe se c'è (build di
    /// sviluppo, si modifica e si ricarica), altrimenti da dentro l'exe.
    /// </summary>
    public static byte[]? LeggiInterfaccia(string cartellaUi, string percorsoUrl)
    {
        var file = FileDellInterfaccia(cartellaUi, percorsoUrl);
        if (file == null) return null;
        if (Directory.Exists(cartellaUi)) return File.Exists(file) ? File.ReadAllBytes(file) : null;
        var relativo = Path.GetRelativePath(cartellaUi, file).Replace(Path.DirectorySeparatorChar, '/');
        if (!RisorseUi.Value.TryGetValue(relativo, out var nome)) return null;
        using var flusso = typeof(Ponte).Assembly.GetManifestResourceStream(nome);
        if (flusso == null) return null;
        using var copia = new MemoryStream();
        flusso.CopyTo(copia);
        return copia.ToArray();
    }

    /// <summary>Le risorse "ui/..." dell'exe, per percorso con le barre dritte (msbuild a volte mette le rovesce).</summary>
    private static readonly Lazy<Dictionary<string, string>> RisorseUi = new(() =>
        typeof(Ponte).Assembly.GetManifestResourceNames()
            .Where(n => n.StartsWith("ui/", StringComparison.Ordinal))
            .ToDictionary(n => n[3..].Replace(Path.DirectorySeparatorChar, '/'), n => n, StringComparer.OrdinalIgnoreCase));

    public static string TipoContenuto(string file) => Path.GetExtension(file).ToLowerInvariant() switch
    {
        ".html" => "text/html; charset=utf-8",
        ".js" => "text/javascript; charset=utf-8",
        ".css" => "text/css; charset=utf-8",
        ".json" => "application/json; charset=utf-8",
        ".svg" => "image/svg+xml",
        ".png" => "image/png",
        ".jpg" or ".jpeg" => "image/jpeg",
        ".ico" => "image/x-icon",
        ".ttf" => "font/ttf",
        ".txt" => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    };

    public async Task<(int Stato, string Json)> GestisciAsync(string metodo, Uri uri, string? corpo)
    {
        metodo = metodo.ToUpperInvariant();
        var percorso = uri.AbsolutePath;
        if (percorso.StartsWith("/foglio/", StringComparison.Ordinal))
        {
            var azione = percorso["/foglio/".Length..].Trim('/');
            if (metodo == "GET")
            {
                var q = HttpUtility.ParseQueryString(uri.Query);
                var parametri = q.AllKeys.Where(k => k != null).Select(k => KeyValuePair.Create(k!, q[k] ?? ""));
                return await foglio.LeggiAsync(azione, parametri).ConfigureAwait(false);
            }
            return await foglio.ScriviAsync(azione, corpo).ConfigureAwait(false);
        }

        var nome = percorso["/locale/".Length..].Trim('/');
        var o = Corpo(corpo);
        switch (nome)
        {
            case "stato":
                return Json(200, new JsonObject
                {
                    ["ok"] = true,
                    ["configurato"] = config.Configurato,
                    ["url"] = config.Url,
                    ["cartellaPdf"] = CartellaPdf,
                    ["versione"] = typeof(Ponte).Assembly.GetName().Version?.ToString(3),
                    ["aggiornamento"] = Aggiornamenti?.ComeJson(),
                });

            case "aggiorna":
                if (Aggiornamenti == null) return Json(200, new JsonObject { ["ok"] = true });
                await Aggiornamenti.ControllaAsync().ConfigureAwait(false);
                return Json(200, new JsonObject { ["ok"] = true, ["aggiornamento"] = Aggiornamenti.ComeJson() });

            case "riavvia":
                if (Aggiornamenti?.Stato != "pronto") return Json(409, Errore("Non c'è una versione nuova da aprire"));
                Finestra?.Riavvia();
                return Json(200, new JsonObject { ["ok"] = true });

            case "configura":
            {
                var url = Testo(o?["url"]);
                var codice = Testo(o?["codice"]);
                if (!url.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
                    return Json(400, Errore("L'indirizzo dello script deve cominciare con https://"));
                // Il codice vuoto vuol dire "lascia quello che c'è": l'interfaccia non lo conosce.
                config.Salva(url, codice.Length > 0 ? codice : config.Codice);
                return Json(200, new JsonObject { ["ok"] = true, ["configurato"] = config.Configurato });
            }

            case "pdf":
                return await PdfAsync(o).ConfigureAwait(false);

            case "apri":
            {
                var file = Testo(o?["percorso"]);
                if (!DentroCartellaPdf(file) || !File.Exists(file)) return Json(404, Errore("File non trovato"));
                Process.Start(new ProcessStartInfo(file) { UseShellExecute = true })?.Dispose();
                return Json(200, new JsonObject { ["ok"] = true });
            }

            case "cartella-pdf":
                Directory.CreateDirectory(CartellaPdf);
                Process.Start(new ProcessStartInfo(CartellaPdf) { UseShellExecute = true })?.Dispose();
                return Json(200, new JsonObject { ["ok"] = true });

            case "scegli-file":
            {
                var scelto = Finestra?.ScegliFile(Testo(o?["filtro"]));
                if (scelto == null) return Json(200, new JsonObject { ["ok"] = false, ["annullato"] = true });
                var (nomeFile, dati) = scelto.Value;
                if (dati.Length > 20_000_000) return Json(413, Errore("File troppo grande (più di 20 MB)"));
                return Json(200, new JsonObject
                {
                    ["ok"] = true,
                    ["nome"] = nomeFile,
                    ["mime"] = TipoContenuto(nomeFile).Split(';')[0],
                    ["base64"] = Convert.ToBase64String(dati),
                });
            }

            default:
                return Json(404, Errore("sconosciuto"));
        }
    }

    /// <summary>
    /// Una foto o una firma di Drive. La prima volta la chiede allo script, poi la
    /// tiene sul disco: le foto non cambiano, e il PDF del mese ne usa decine.
    /// </summary>
    public async Task<(int Stato, string Mime, byte[] Dati)> FileAsync(Uri uri)
    {
        var id = uri.AbsolutePath["/file/".Length..].Trim('/');
        if (id.Length < 10 || !id.All(c => char.IsLetterOrDigit(c) || c is '-' or '_')) return (404, "text/plain", Array.Empty<byte>());
        Directory.CreateDirectory(cartellaFile);
        var dati = Path.Combine(cartellaFile, id);
        var tipo = dati + ".tipo";
        if (File.Exists(dati) && File.Exists(tipo)) return (200, File.ReadAllText(tipo), File.ReadAllBytes(dati));
        var file = await foglio.FileAsync(id).ConfigureAwait(false);
        if (file == null) return (404, "text/plain", Array.Empty<byte>());
        File.WriteAllBytes(dati, file.Value.Dati);
        File.WriteAllText(tipo, file.Value.Mime);
        return (200, file.Value.Mime, file.Value.Dati);
    }

    private async Task<(int, string)> PdfAsync(JsonObject? o)
    {
        if (Finestra == null) return Json(503, Errore("La finestra non è pronta"));
        var html = Testo(o?["html"]);
        var nome = NomeFilePulito(Testo(o?["nome"]));
        if (html.Length == 0 || nome.Length == 0) return Json(400, Errore("Manca il documento"));
        Directory.CreateDirectory(CartellaPdf);
        var percorso = Path.Combine(CartellaPdf, nome + ".pdf");
        if (!await Finestra.StampaAsync(html, percorso)) return Json(500, Errore("Il PDF non si è creato"));
        if (o?["apri"]?.GetValue<bool>() == true)
            Process.Start(new ProcessStartInfo(percorso) { UseShellExecute = true })?.Dispose();
        return Json(200, new JsonObject
        {
            ["ok"] = true,
            ["percorso"] = percorso,
            ["nome"] = nome + ".pdf",
            ["base64"] = o?["base64"]?.GetValue<bool>() == true ? Convert.ToBase64String(await File.ReadAllBytesAsync(percorso)) : null,
        });
    }

    /// <summary>"RAP/2026/0003 Batokyo" -> "RAP-2026-0003 Batokyo": niente caratteri che Windows rifiuta.</summary>
    public static string NomeFilePulito(string nome)
    {
        var vietati = Path.GetInvalidFileNameChars();
        var pulito = new string(nome.Select(c => vietati.Contains(c) ? '-' : c).ToArray()).Trim(' ', '.', '-');
        return pulito.Length > 120 ? pulito[..120] : pulito;
    }

    private bool DentroCartellaPdf(string file)
    {
        if (file.Length == 0) return false;
        var radice = Path.GetFullPath(CartellaPdf).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
        return Path.GetFullPath(file).StartsWith(radice, StringComparison.OrdinalIgnoreCase);
    }

    private static JsonObject? Corpo(string? corpo)
    {
        if (string.IsNullOrWhiteSpace(corpo)) return null;
        try
        {
            return JsonNode.Parse(corpo) as JsonObject;
        }
        catch (System.Text.Json.JsonException)
        {
            return null;
        }
    }

    private static string Testo(JsonNode? n)
    {
        try
        {
            return n?.GetValue<string>()?.Trim() ?? "";
        }
        catch (InvalidOperationException)
        {
            return n?.ToString() ?? "";
        }
    }

    private static JsonObject Errore(string messaggio) => new() { ["ok"] = false, ["errore"] = messaggio };

    private static (int, string) Json(int stato, JsonObject o) => (stato, o.ToJsonString());
}
