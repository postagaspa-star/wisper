using System.Diagnostics;
using System.Text.Json.Nodes;
using System.Web;

namespace WisperUfficio;

/// <summary>
/// L'accordo fra programma e interfaccia, sul modello di Pactum. La pagina è servita
/// da https://wisper.locale/ e chiama solo:
///   /locale/*   cose del computer (entrare e uscire, PDF, file da scegliere o salvare)
///   /server/*   il server di Wisper, a cui il ponte aggiunge la chiave d'accesso
///   /file/{id}  una foto, una firma o un documento, tenuto in copia sul disco
/// La chiave d'accesso (il token) resta qui: l'interfaccia non la vede mai.
/// Niente porte aperte sul computer: tutto passa dentro WebView2.
/// </summary>
public sealed class Ponte
{
    public const string Host = "wisper.locale";
    public const string Origine = "https://" + Host;

    private readonly Configurazione config;
    private readonly Server server;
    private readonly string cartellaFile;

    /// <summary>Dove finiscono i PDF: Documenti\Wisper.</summary>
    public string CartellaPdf { get; }

    /// <summary>Le cose che sa fare solo la finestra: stampare in PDF, scegliere o salvare un file, riaprirsi aggiornata.</summary>
    public interface IFinestra
    {
        Task<bool> StampaAsync(string html, string percorso);
        (string Nome, byte[] Dati)? ScegliFile(string filtro);
        string? SalvaFile(string nomeProposto);
        void Riavvia();

        /// <summary>Un promemoria (fase 2): la notifica di Windows, finché il programma è aperto.</summary>
        void Notifica(string titolo, string testo);
    }

    public IFinestra? Finestra { get; set; }

    public Aggiornamenti? Aggiornamenti { get; set; }

    /// <summary>La prima apertura dopo l'installazione: la pagina dice dove trovarlo.</summary>
    public bool AppenaInstallato { get; set; }

    /// <summary>Le opzioni con cui è partito il programma: il riavvio dopo un aggiornamento le ripete.</summary>
    public IReadOnlyList<string> ArgomentiDiAvvio { get; set; } = Array.Empty<string>();

    public Ponte(Configurazione config, Server server, string cartellaFile, string cartellaPdf)
    {
        this.config = config;
        this.server = server;
        this.cartellaFile = cartellaFile;
        CartellaPdf = cartellaPdf;
    }

    public static bool ÈInterno(string? indirizzo) =>
        indirizzo == "about:blank" ||
        (Uri.TryCreate(indirizzo, UriKind.Absolute, out var u) && u.Scheme == Uri.UriSchemeHttps &&
         string.Equals(u.Host, Host, StringComparison.OrdinalIgnoreCase) && u.IsDefaultPort);

    /// <summary>Solo pagine web, posta e telefono si aprono fuori: niente file o programmi da un link.</summary>
    public static bool ApribileFuori(string? indirizzo) =>
        Uri.TryCreate(indirizzo, UriKind.Absolute, out var u) &&
        (u.Scheme == Uri.UriSchemeHttps || u.Scheme == Uri.UriSchemeHttp || u.Scheme == Uri.UriSchemeMailto || u.Scheme == "tel") &&
        !string.Equals(u.Host, Host, StringComparison.OrdinalIgnoreCase);

    public static bool ÈApi(Uri uri) =>
        uri.AbsolutePath.StartsWith("/locale/", StringComparison.Ordinal) ||
        uri.AbsolutePath.StartsWith("/server/", StringComparison.Ordinal);

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
        ".pdf" => "application/pdf",
        _ => "application/octet-stream",
    };

    public async Task<(int Stato, string Json)> GestisciAsync(string metodo, Uri uri, string? corpo)
    {
        metodo = metodo.ToUpperInvariant();
        var percorso = uri.AbsolutePath;
        if (percorso.StartsWith("/server/", StringComparison.Ordinal))
        {
            var azione = percorso["/server/".Length..].Trim('/');
            // Entrare e uscire passano da /locale/: il token non deve mai arrivare alla pagina.
            if (azione is "accedi" or "esci") return Json(400, Errore("Si entra ed esce da /locale/accedi e /locale/esci"));
            (int, string) risposta;
            if (metodo == "GET")
            {
                var q = HttpUtility.ParseQueryString(uri.Query);
                var parametri = q.AllKeys.Where(k => k != null).Select(k => KeyValuePair.Create(k!, q[k] ?? ""));
                risposta = await server.LeggiAsync(azione, parametri).ConfigureAwait(false);
            }
            else
            {
                risposta = await server.ScriviAsync(azione, corpo).ConfigureAwait(false);
            }
            // La ragione sociale si ricorda: la pagina di accesso la mostra anche senza essere entrati.
            if (azione == "io" && risposta.Item1 == 200) RicordaStudio(risposta.Item2);
            return risposta;
        }

        var nome = percorso["/locale/".Length..].Trim('/');
        var o = Corpo(corpo);
        switch (nome)
        {
            case "stato":
                config.RileggiSeCambiato();
                return Json(200, new JsonObject
                {
                    ["ok"] = true,
                    ["entrato"] = config.Entrato,
                    // L'indirizzo del server si vede (è scritto anche sotto la pagina di accesso); il token no.
                    ["server"] = config.Server,
                    ["email"] = config.Email,
                    ["studio"] = config.Studio,
                    ["cartellaPdf"] = CartellaPdf,
                    ["versione"] = typeof(Ponte).Assembly.GetName().Version?.ToString(3),
                    ["aggiornamento"] = Aggiornamenti?.ComeJson(),
                    ["appenaInstallato"] = AppenaInstallato,
                });

            case "accedi":
                return await AccediAsync(o).ConfigureAwait(false);

            case "esci":
                await server.EsciAsync().ConfigureAwait(false);
                config.Esci();
                return Json(200, new JsonObject { ["ok"] = true });

            case "aggiorna":
                if (Aggiornamenti == null) return Json(200, new JsonObject { ["ok"] = true });
                await Aggiornamenti.ControllaAsync().ConfigureAwait(false);
                return Json(200, new JsonObject { ["ok"] = true, ["aggiornamento"] = Aggiornamenti.ComeJson() });

            case "riavvia":
                if (Aggiornamenti?.Stato != "pronto") return Json(409, Errore("Non c'è una versione nuova da aprire"));
                Finestra?.Riavvia();
                return Json(200, new JsonObject { ["ok"] = true });

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

            case "salva-file":
                return SalvaFile(o);

            case "apri-documento":
                return await ApriDocumentoAsync(o).ConfigureAwait(false);

            case "notifica":
            {
                // Solo testo corto: titolo e una riga, come un promemoria. Niente link, niente azioni.
                var titolo = Testo(o?["titolo"]);
                var testo = Testo(o?["testo"]);
                if (testo.Length == 0) return Json(400, Errore("Manca il testo"));
                Finestra?.Notifica(titolo.Length > 63 ? titolo[..63] : titolo, testo.Length > 250 ? testo[..250] : testo);
                return Json(200, new JsonObject { ["ok"] = true });
            }

            default:
                return Json(404, Errore("sconosciuto"));
        }
    }

    /// <summary>
    /// Entra con email e password: il server dà la chiave, che resta qui (cifrata con
    /// DPAPI); alla pagina vanno solo chi è entrato e cosa può fare.
    /// </summary>
    private async Task<(int, string)> AccediAsync(JsonObject? o)
    {
        var email = Testo(o?["email"]);
        var password = o?["password"] is JsonNode p ? (p.GetValueKind() == System.Text.Json.JsonValueKind.String ? p.GetValue<string>() : "") : "";
        var scritto = Testo(o?["server"]);
        var indirizzo = scritto.Length > 0 ? IndirizzoServer.Pulito(scritto) : config.Server;
        if (string.IsNullOrEmpty(indirizzo))
            return Json(200, Errore(scritto.Length > 0
                ? "L'indirizzo del server non va bene: deve cominciare con https:// (http:// solo nella rete di casa)"
                : "Scrivi l'indirizzo del server"));
        if (email.Length == 0 || password.Length == 0) return Json(200, Errore("Scrivi email e password"));

        var r = await server.AccediAsync(indirizzo, email, password).ConfigureAwait(false);
        if (r["ok"]?.GetValue<bool>() != true)
        {
            // Senza "rete" l'errore è del server (password sbagliata, troppi tentativi): si mostra com'è.
            return Json(200, r);
        }
        var token = Testo(r["token"]);
        if (token.Length == 0) return Json(200, Errore("Il server non ha dato la chiave d'accesso"));
        config.SalvaAccesso(indirizzo, token, email);
        Log.Info("entrato come " + (r["utente"]?["ruolo"]?.ToString() ?? "?"));
        return Json(200, new JsonObject
        {
            ["ok"] = true,
            ["utente"] = r["utente"]?.DeepClone(),
            ["permessi"] = r["permessi"]?.DeepClone(),
        });
    }

    private void RicordaStudio(string json)
    {
        try
        {
            if (JsonNode.Parse(json) is JsonObject io && io["ok"]?.GetValue<bool>() == true) config.SalvaStudio(Testo(io["ragioneSociale"]));
        }
        catch (Exception e) when (e is System.Text.Json.JsonException or InvalidOperationException or IOException)
        {
            // Non serve a niente di importante: si va avanti.
        }
    }

    /// <summary>Un'esportazione per Excel (il CSV del server): si salva con la finestra Salva di Windows.</summary>
    private (int, string) SalvaFile(JsonObject? o)
    {
        if (Finestra == null) return Json(503, Errore("La finestra non è pronta"));
        var nome = NomeFilePulito(Testo(o?["nome"]));
        if (nome.Length == 0) nome = "wisper.csv";
        byte[] dati;
        try
        {
            var b64 = Testo(o?["base64"]);
            dati = b64.Length > 0 ? Convert.FromBase64String(b64) : System.Text.Encoding.UTF8.GetBytes(o?["testo"]?.GetValue<string>() ?? "");
        }
        catch (FormatException)
        {
            return Json(400, Errore("Il file non è arrivato intero"));
        }
        var dove = Finestra.SalvaFile(nome);
        if (dove == null) return Json(200, new JsonObject { ["ok"] = false, ["annullato"] = true });
        File.WriteAllBytes(dove, dati);
        return Json(200, new JsonObject { ["ok"] = true, ["percorso"] = dove });
    }

    /// <summary>I tipi di documento che si aprono col loro programma. Gli altri (un .exe, uno script) si salvano e basta.</summary>
    private static readonly HashSet<string> Apribili = new(StringComparer.OrdinalIgnoreCase)
    {
        ".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tif", ".tiff", ".txt", ".csv",
        ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".odt", ".ods", ".rtf", ".dwg", ".dxf", ".p7m",
    };

    /// <summary>Un documento di una commessa: si scarica dal server e si apre col programma di Windows.</summary>
    private async Task<(int, string)> ApriDocumentoAsync(JsonObject? o)
    {
        var id = Testo(o?["id"]);
        if (id.Length < 10 || !id.All(c => char.IsLetterOrDigit(c) || c is '-' or '_')) return Json(404, Errore("Documento non trovato"));
        var nome = NomeFilePulito(Testo(o?["nome"]));
        if (nome.Length == 0) nome = id;
        var (stato, _, dati) = await server.FileAsync(id).ConfigureAwait(false);
        if (stato == 401) return Json(200, new JsonObject { ["ok"] = false, ["errore"] = "Accesso scaduto: entra di nuovo", ["accesso"] = false });
        if (stato != 200) return Json(200, Errore(stato == 502 ? "Il server non risponde: controlla la rete e riprova" : "Il documento non c'è più"));
        if (!Apribili.Contains(Path.GetExtension(nome)))
        {
            var dove = Finestra?.SalvaFile(nome);
            if (dove == null) return Json(200, new JsonObject { ["ok"] = false, ["annullato"] = true });
            File.WriteAllBytes(dove, dati);
            return Json(200, new JsonObject { ["ok"] = true, ["percorso"] = dove });
        }
        var cartella = Path.Combine(Path.GetTempPath(), "Wisper", id);
        Directory.CreateDirectory(cartella);
        var file = Path.Combine(cartella, nome);
        await File.WriteAllBytesAsync(file, dati).ConfigureAwait(false);
        Process.Start(new ProcessStartInfo(file) { UseShellExecute = true })?.Dispose();
        return Json(200, new JsonObject { ["ok"] = true, ["percorso"] = file });
    }

    /// <summary>
    /// Una foto, una firma o un documento. La prima volta lo chiede al server, poi lo
    /// tiene sul disco: i file non cambiano (un file nuovo ha un id nuovo), e il PDF del
    /// mese ne usa decine. Solo da entrati: la copia sul disco non scavalca l'accesso.
    /// </summary>
    public async Task<(int Stato, string Mime, byte[] Dati)> FileAsync(Uri uri)
    {
        var id = uri.AbsolutePath["/file/".Length..].Trim('/');
        if (id.Length < 10 || !id.All(c => char.IsLetterOrDigit(c) || c is '-' or '_')) return (404, "text/plain", Array.Empty<byte>());
        if (!config.Entrato) return (401, "text/plain", Array.Empty<byte>());
        Directory.CreateDirectory(cartellaFile);
        var dati = Path.Combine(cartellaFile, id);
        var tipo = dati + ".tipo";
        if (File.Exists(dati) && File.Exists(tipo)) return (200, File.ReadAllText(tipo), File.ReadAllBytes(dati));
        var file = await server.FileAsync(id).ConfigureAwait(false);
        if (file.Stato != 200) return (file.Stato, "text/plain", Array.Empty<byte>());
        File.WriteAllBytes(dati, file.Dati);
        File.WriteAllText(tipo, file.Mime);
        return (200, file.Mime, file.Dati);
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
