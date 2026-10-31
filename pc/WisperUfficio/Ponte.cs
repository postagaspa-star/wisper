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

        /// <summary>Fase 4: più file insieme (le fatture elettroniche da importare).</summary>
        IReadOnlyList<(string Nome, byte[] Dati)>? ScegliPiuFile(string filtro);

        /// <summary>Fase 5: un file da caricare in byte (/carica): solo il percorso, il programma lo legge mentre lo manda.</summary>
        string? ScegliPercorso(string filtro);
        string? SalvaFile(string nomeProposto);
        void Riavvia();

        /// <summary>Un promemoria (fase 2): la notifica di Windows, finché il programma è aperto.</summary>
        void Notifica(string titolo, string testo);
    }

    public IFinestra? Finestra { get; set; }

    public Aggiornamenti? Aggiornamenti { get; set; }

    /// <summary>La prima apertura dopo l'installazione: la pagina dice dove trovarlo.</summary>
    public bool AppenaInstallato { get; set; }

    /// <summary>Aperto col doppio clic sul file .wisper: la pagina dice che adesso sa la strada da fuori.</summary>
    public bool AppenaCollegato { get; set; }

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
            {
                config.RileggiSeCambiato();
                // L'indirizzo del server di casa si vede (è scritto anche sotto la pagina di accesso); il token
                // e l'indirizzo dello script Google no: della porta Google la pagina sa solo se c'è.
                var collegamento = server.Stato();
                var risposta = new JsonObject
                {
                    ["ok"] = true,
                    ["entrato"] = config.Entrato,
                    ["server"] = config.Server,
                    ["email"] = config.Email,
                    ["studio"] = config.Studio,
                    ["cartellaPdf"] = CartellaPdf,
                    ["versione"] = typeof(Ponte).Assembly.GetName().Version?.ToString(3),
                    ["aggiornamento"] = Aggiornamenti?.ComeJson(),
                    ["appenaInstallato"] = AppenaInstallato,
                    ["appenaCollegato"] = AppenaCollegato,
                };
                foreach (var (k, v) in collegamento) risposta[k] = v?.DeepClone();
                AppenaCollegato = false;
                return Json(200, risposta);
            }

            case "accedi":
                return await AccediAsync(o).ConfigureAwait(false);

            case "collega-file":
            {
                // Il file .wisper dell'email, scelto a mano: dentro c'è l'indirizzo della porta Google.
                var scelto = Finestra?.ScegliPercorso("collegamento");
                if (scelto == null) return Json(200, new JsonObject { ["ok"] = false, ["annullato"] = true });
                var errore = FileCollegamento.Importa(scelto, config);
                if (errore != null) return Json(200, Errore(errore));
                server.Dimentica();
                return Json(200, new JsonObject { ["ok"] = true, ["google"] = config.Google.Length > 0, ["casa"] = config.Server });
            }

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
                // Fase 5: "percorso: true" = il file resta sul disco; la pagina riceve un riferimento (rif) da passare a /locale/carica.
                if (o?["percorso"] is JsonNode conPercorso && conPercorso.GetValueKind() == System.Text.Json.JsonValueKind.True)
                {
                    var percorsoScelto = Finestra?.ScegliPercorso(Testo(o?["filtro"]));
                    if (percorsoScelto == null) return Json(200, new JsonObject { ["ok"] = false, ["annullato"] = true });
                    var info = new FileInfo(percorsoScelto);
                    var rif = Guid.NewGuid().ToString("N");
                    lock (sceltiDaCaricare)
                    {
                        if (sceltiDaCaricare.Count > 50) sceltiDaCaricare.Clear();
                        sceltiDaCaricare[rif] = percorsoScelto;
                    }
                    return Json(200, new JsonObject
                    {
                        ["ok"] = true,
                        ["rif"] = rif,
                        ["nome"] = info.Name,
                        ["mime"] = TipoContenuto(info.Name).Split(';')[0],
                        ["byte"] = info.Length,
                    });
                }
                // Fase 4: Importa XML sceglie più file insieme (fino a 300 e 30 MB, come accetta il server).
                if (o?["piu"] is JsonNode piu && piu.GetValueKind() == System.Text.Json.JsonValueKind.True)
                {
                    var tanti = Finestra?.ScegliPiuFile(Testo(o?["filtro"]));
                    if (tanti == null || tanti.Count == 0) return Json(200, new JsonObject { ["ok"] = false, ["annullato"] = true });
                    if (tanti.Count > 300) return Json(200, Errore("Troppi file: al massimo 300 per volta"));
                    if (tanti.Sum(f => (long)f.Dati.Length) > 30L * 1024 * 1024) return Json(200, Errore("File troppo grandi: al massimo 30 MB per volta"));
                    var elenco = new JsonArray();
                    foreach (var (n, d) in tanti) elenco.Add(new JsonObject { ["nome"] = n, ["base64"] = Convert.ToBase64String(d) });
                    return Json(200, new JsonObject { ["ok"] = true, ["file"] = elenco });
                }
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

            case "carica":
            {
                // Fase 5: il file scelto prima (rif) va al server in byte, letto dal disco mentre parte.
                var rif = Testo(o?["rif"]);
                string? file;
                lock (sceltiDaCaricare) sceltiDaCaricare.TryGetValue(rif, out file);
                if (file == null || !File.Exists(file)) return Json(200, Errore("Il file scelto non c'è più: sceglilo di nuovo"));
                var per = Testo(o?["per"]);
                await using var flusso = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.Read, 81920, useAsync: true);
                return await server.CaricaAsync(flusso, flusso.Length, Path.GetFileName(file), TipoContenuto(file).Split(';')[0], Testo(o?["idFile"]), per.Length > 0 ? per : "documento").ConfigureAwait(false);
            }

            case "apri-collegamento":
                return await ApriCollegamentoAsync(Testo(o?["url"])).ConfigureAwait(false);

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

    /// <summary>Fase 5: i file scelti per /carica (riferimento -> percorso): la pagina non manda mai un percorso.</summary>
    private readonly Dictionary<string, string> sceltiDaCaricare = new();

    /// <summary>
    /// Fase 5: un file trascinato sulla pagina (o un PDF appena fatto) arriva qui in byte, così com'è:
    /// POST /locale/carica-corpo?nome=&amp;mime=&amp;per=&amp;idFile=, e va al server con la chiave.
    /// </summary>
    public async Task<(int Stato, string Json)> CaricaCorpoAsync(Uri uri, Stream? corpo)
    {
        if (corpo == null) return Json(200, Errore("File vuoto"));
        var q = HttpUtility.ParseQueryString(uri.Query);
        var nome = NomeFilePulito(q["nome"] ?? "");
        if (nome.Length == 0) nome = "documento";
        var per = q["per"] ?? "documento";
        long? lunghezza = null;
        try { if (corpo.CanSeek) lunghezza = corpo.Length; } catch (NotSupportedException) { lunghezza = null; }
        return await server.CaricaAsync(corpo, lunghezza, nome, q["mime"] ?? "application/octet-stream", q["idFile"] ?? "", per).ConfigureAwait(false);
    }

    /// <summary>
    /// Fase 5: un collegamento dell'archivio. Un indirizzo https:// si apre col browser (o con l'app di OneDrive);
    /// un percorso del computer dello studio (\\server\..., X:\..., file:///...) in Esplora file: una cartella si
    /// apre, un file si mostra selezionato nella sua cartella. Niente viene eseguito.
    /// </summary>
    private static async Task<(int, string)> ApriCollegamentoAsync(string url)
    {
        if (url.Length == 0) return Json(200, Errore("Manca il collegamento"));
        if (Uri.TryCreate(url, UriKind.Absolute, out var u) && u.Scheme == Uri.UriSchemeHttps)
        {
            Process.Start(new ProcessStartInfo(u.AbsoluteUri) { UseShellExecute = true })?.Dispose();
            return Json(200, new JsonObject { ["ok"] = true });
        }
        string? percorso = null;
        if (url.StartsWith(@"\\", StringComparison.Ordinal) || (url.Length > 2 && char.IsLetter(url[0]) && url[1] == ':' && url[2] == '\\')) percorso = url;
        else if (url.StartsWith("file:///", StringComparison.OrdinalIgnoreCase) && Uri.TryCreate(url, UriKind.Absolute, out var f) && f.IsFile) percorso = f.LocalPath;
        if (percorso == null || percorso.IndexOfAny(new[] { '"', '\0', '\n', '\r' }) >= 0)
            return Json(200, Errore("Collegamento: incolla un indirizzo che comincia con https:// o un percorso come \\\\server\\cartella"));
        // Un server dello studio spento farebbe aspettare a lungo: si guarda per al massimo 8 secondi.
        var guarda = Task.Run(() => Directory.Exists(percorso) ? "cartella" : File.Exists(percorso) ? "file" : "");
        var chi = await Task.WhenAny(guarda, Task.Delay(TimeSpan.FromSeconds(8))).ConfigureAwait(false);
        var cosa = chi == guarda ? guarda.Result : "";
        if (cosa.Length == 0) return Json(200, Errore("Da questo computer il percorso non si trova: controlla che la cartella dello studio sia collegata"));
        var explorer = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), "explorer.exe");
        var argomenti = cosa == "cartella" ? "\"" + percorso.TrimEnd('\\') + "\"" : "/select,\"" + percorso + "\"";
        Process.Start(new ProcessStartInfo(explorer, argomenti) { UseShellExecute = false })?.Dispose();
        return Json(200, new JsonObject { ["ok"] = true });
    }

    /// <summary>
    /// Entra con email e password: il server dà la chiave, che resta qui (cifrata con
    /// DPAPI); alla pagina vanno solo chi è entrato e cosa può fare.
    /// </summary>
    private async Task<(int, string)> AccediAsync(JsonObject? o)
    {
        var email = Testo(o?["email"]);
        var password = o?["password"] is JsonNode p ? (p.GetValueKind() == System.Text.Json.JsonValueKind.String ? p.GetValue<string>() : "") : "";
        // Gli indirizzi scritti nella pagina (Cambia): vuoti = quelli di adesso. "server" è il nome di prima di casa.
        var scrittaCasa = Testo(o?["casa"]);
        if (scrittaCasa.Length == 0) scrittaCasa = Testo(o?["server"]);
        var scrittoGoogle = Testo(o?["google"]);
        var togliGoogle = o?["togliGoogle"] is JsonNode tg && tg.GetValueKind() == System.Text.Json.JsonValueKind.True;
        string? casaNuova = null, googleNuovo = null;
        if (scrittaCasa.Length > 0)
        {
            casaNuova = IndirizzoServer.Pulito(scrittaCasa);
            if (casaNuova == null) return Json(200, Errore("L'indirizzo di casa non va bene: deve cominciare con http:// nella rete di casa, altrimenti con https://"));
        }
        if (scrittoGoogle.Length > 0)
        {
            googleNuovo = IndirizzoGoogle.Pulito(scrittoGoogle);
            if (googleNuovo == null) return Json(200, Errore("L'indirizzo Google non va bene: è quello dello script del foglio, che finisce con /exec"));
        }
        else if (togliGoogle)
        {
            googleNuovo = "";
        }
        var casa = casaNuova ?? config.Server;
        var google = googleNuovo ?? config.Google;
        if (casa.Length == 0 && google.Length == 0) return Json(200, Errore("Scrivi l'indirizzo del server"));
        if (email.Length == 0 || password.Length == 0) return Json(200, Errore("Scrivi email e password"));

        var r = await server.AccediAsync(casa, google, email, password).ConfigureAwait(false);
        if (r["ok"]?.GetValueKind() != System.Text.Json.JsonValueKind.True)
        {
            // Senza "rete" l'errore è del server (password sbagliata, troppi tentativi): si mostra com'è.
            return Json(200, r);
        }
        var token = Testo(r["token"]);
        if (token.Length == 0) return Json(200, Errore("Il server non ha dato la chiave d'accesso"));
        config.SalvaAccesso(casaNuova, googleNuovo, token, email);
        server.Dimentica();
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
        var (stato, _, dati, errore) = await server.FileAsync(id).ConfigureAwait(false);
        if (stato == 401) return Json(200, new JsonObject { ["ok"] = false, ["errore"] = "Accesso scaduto: entra di nuovo", ["accesso"] = false });
        if (stato == 403) return Json(200, new JsonObject { ["ok"] = false, ["errore"] = "Non hai il permesso per vedere questo documento: chiedi al titolare", ["permesso"] = false });
        // Da Google un file oltre 25 MB non passa: si apre dall'ufficio.
        if (stato == 413) return Json(200, Errore(errore.Length > 0 ? errore : "Il documento è troppo grande per passare da Google: aprilo quando sei in ufficio"));
        if (stato == 502) return Json(200, new JsonObject { ["ok"] = false, ["errore"] = errore.Length > 0 ? errore : "Il server non risponde: controlla la rete e riprova", ["rete"] = true });
        if (stato != 200) return Json(200, Errore("Il documento non c'è più"));
        // Fase 5: "Scarica" (salva: true) chiede sempre dove salvarlo, col nome che dice la revisione.
        var salva = o?["salva"] is JsonNode s && s.GetValueKind() == System.Text.Json.JsonValueKind.True;
        if (salva || !Apribili.Contains(Path.GetExtension(nome)))
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
