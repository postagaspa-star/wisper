using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json.Nodes;

namespace WisperUfficio;

/// <summary>
/// Le chiamate al server di Wisper (server/, docs/gestionale/architettura.md §2 e §12),
/// con la chiave d'accesso aggiunta qui: "Authorization: Bearer". Le risposte passano
/// all'interfaccia così come sono: i conti e i permessi li fa il server, il programma
/// non ne rifà nessuno. Al posto di Foglio.cs (lo script del foglio, fino alla 0.4).
///
///  - GET  &lt;server&gt;/exec?azione=...   per leggere;
///  - POST &lt;server&gt;/exec {azione, ...} per scrivere (e per accedi ed esci);
///  - GET  &lt;server&gt;/file/&lt;id&gt;       per foto, firme e documenti.
/// Se il server dice accesso:false la chiave non vale più: si butta, e l'interfaccia
/// torna alla pagina di accesso.
/// </summary>
public sealed class Server
{
    private readonly Configurazione config;

    private readonly HttpClient http = new(new SocketsHttpHandler
    {
        AllowAutoRedirect = false,
        PooledConnectionLifetime = TimeSpan.FromMinutes(5),
    })
    {
        // Un PDF con tante foto, o il NAS appena acceso, può metterci un po'.
        Timeout = TimeSpan.FromSeconds(90),
    };

    public Server(Configurazione config) => this.config = config;

    /// <summary>accedi {email, password}: la risposta del server, col token (che il ponte tiene per sé).</summary>
    public async Task<JsonObject> AccediAsync(string server, string email, string password)
    {
        var o = new JsonObject { ["azione"] = "accedi", ["email"] = email, ["password"] = password };
        foreach (var (k, v) in ChiSono()) o[k] = v;
        var (_, json) = await ChiamaAsync(() => new HttpRequestMessage(HttpMethod.Post, server + "/exec")
        {
            Content = new StringContent(o.ToJsonString(), Encoding.UTF8, "application/json"),
        }, conChiave: false).ConfigureAwait(false);
        return JsonNode.Parse(json) as JsonObject ?? Errore("Risposta non valida dal server");
    }

    /// <summary>esci: il token non vale più neanche sul server. Se il server non risponde, si esce lo stesso.</summary>
    public async Task EsciAsync()
    {
        if (!config.Entrato) return;
        await ScriviAsync("esci", "{}").ConfigureAwait(false);
    }

    public async Task<(int Stato, string Json)> LeggiAsync(string azione, IEnumerable<KeyValuePair<string, string>> parametri)
    {
        config.RileggiSeCambiato();
        if (!config.Entrato) return Uscito();
        var query = new StringBuilder("?azione=").Append(Uri.EscapeDataString(azione));
        foreach (var (k, v) in parametri)
        {
            if (k is "azione" or "codice" or "disp" or "dispNome" or "app") continue;
            query.Append('&').Append(Uri.EscapeDataString(k)).Append('=').Append(Uri.EscapeDataString(v));
        }
        var url = config.Server + "/exec" + query;
        var risposta = await ChiamaAsync(() => new HttpRequestMessage(HttpMethod.Get, url)).ConfigureAwait(false);
        // Una lettura si può ripetere senza danni: al primo singhiozzo della rete si riprova una volta.
        // (Le scritture no: un invio di email partirebbe due volte.)
        if (risposta.Item1 == 502)
        {
            await Task.Delay(1200).ConfigureAwait(false);
            risposta = await ChiamaAsync(() => new HttpRequestMessage(HttpMethod.Get, url)).ConfigureAwait(false);
        }
        return risposta;
    }

    public async Task<(int Stato, string Json)> ScriviAsync(string azione, string? corpo)
    {
        config.RileggiSeCambiato();
        if (!config.Entrato) return Uscito();
        JsonObject o;
        try
        {
            o = (string.IsNullOrWhiteSpace(corpo) ? null : JsonNode.Parse(corpo) as JsonObject) ?? new JsonObject();
        }
        catch (System.Text.Json.JsonException)
        {
            return (400, Errore("Richiesta non valida").ToJsonString());
        }
        o["azione"] = azione;
        // La chiave d'accesso viaggia nell'intestazione, mai nel corpo.
        o.Remove("token");
        o.Remove("codice");
        var testo = o.ToJsonString();
        return await ChiamaAsync(() => new HttpRequestMessage(HttpMethod.Post, config.Server + "/exec")
        {
            Content = new StringContent(testo, Encoding.UTF8, "application/json"),
        }).ConfigureAwait(false);
    }

    /// <summary>Un file (foto, firma, documento): null se non c'è o non si può vedere; Uscito se la chiave non vale più.</summary>
    public async Task<(int Stato, string Mime, byte[] Dati)> FileAsync(string id)
    {
        if (!config.Entrato) return (401, "text/plain", Array.Empty<byte>());
        try
        {
            using var rq = new HttpRequestMessage(HttpMethod.Get, config.Server + "/file/" + Uri.EscapeDataString(id));
            rq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", config.Token);
            using var r = await http.SendAsync(rq).ConfigureAwait(false);
            if (r.StatusCode == HttpStatusCode.Unauthorized)
            {
                config.Esci();
                return (401, "text/plain", Array.Empty<byte>());
            }
            if (!r.IsSuccessStatusCode) return ((int)r.StatusCode, "text/plain", Array.Empty<byte>());
            var dati = await r.Content.ReadAsByteArrayAsync().ConfigureAwait(false);
            return (200, r.Content.Headers.ContentType?.MediaType ?? "application/octet-stream", dati);
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException or IOException)
        {
            Log.Errore("file non scaricato", e);
            return (502, "text/plain", Array.Empty<byte>());
        }
    }

    private async Task<(int, string)> ChiamaAsync(Func<HttpRequestMessage> richiesta, bool conChiave = true)
    {
        try
        {
            using var rq = richiesta();
            if (conChiave) rq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", config.Token);
            rq.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
            using var r = await http.SendAsync(rq).ConfigureAwait(false);
            var testo = await r.Content.ReadAsStringAsync().ConfigureAwait(false);
            if (!testo.TrimStart().StartsWith('{'))
            {
                return r.StatusCode == HttpStatusCode.NotFound
                    ? (502, Errore("A questo indirizzo non risponde un server di Wisper: controlla che sia scritto giusto").ToJsonString())
                    : (502, Errore($"Il server ha risposto {(int)r.StatusCode}", rete: true).ToJsonString());
            }
            // Accesso scaduto o revocato: la chiave si butta subito, così alla prossima apertura si chiede di entrare.
            if (conChiave && testo.Contains("\"accesso\":false", StringComparison.Ordinal)) config.Esci();
            return (200, testo);
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException or IOException or UriFormatException or InvalidOperationException)
        {
            Log.Errore("server non raggiunto", e);
            return (502, Errore(e is TaskCanceledException ? "Il server non ha risposto in tempo: controlla la rete e riprova" : "Il server non risponde: controlla la rete e riprova", rete: true).ToJsonString());
        }
    }

    /// <summary>Chi chiama: il server lo scrive negli accessi e fra i dispositivi collegati.</summary>
    private KeyValuePair<string, string>[] ChiSono() => new[]
    {
        KeyValuePair.Create("disp", config.Dispositivo),
        KeyValuePair.Create("dispNome", Configurazione.NomeDispositivo),
        KeyValuePair.Create("app", "ufficio " + Versione),
    };

    public static readonly string Versione =
        typeof(Server).Assembly.GetName().Version is { } v ? $"{v.Major}.{v.Minor}.{v.Build}" : "?";

    private static (int, string) Uscito() =>
        (200, new JsonObject { ["ok"] = false, ["errore"] = "Accesso scaduto: entra di nuovo", ["accesso"] = false }.ToJsonString());

    private static JsonObject Errore(string messaggio, bool rete = false) =>
        new() { ["ok"] = false, ["errore"] = messaggio, ["rete"] = rete };
}
