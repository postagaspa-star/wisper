using System.Net.Http;
using System.Text;
using System.Text.Json.Nodes;

namespace WisperUfficio;

/// <summary>
/// Le chiamate allo script del foglio (apps-script/Code.gs), con il codice aggiunto
/// qui. Le risposte passano all'interfaccia così come sono: i conti li fa lo script,
/// il programma non ne rifà nessuno.
///
/// Apps Script risponde a una POST con un rimbalzo (302) verso un secondo indirizzo,
/// da leggere con una GET: è quello che HttpClient fa da solo, e va lasciato fare.
/// </summary>
public sealed class Foglio
{
    private readonly Configurazione config;

    private readonly HttpClient http = new(new SocketsHttpHandler
    {
        AllowAutoRedirect = true,
        MaxAutomaticRedirections = 5,
        PooledConnectionLifetime = TimeSpan.FromMinutes(5),
    })
    {
        // Lo script, da freddo e con un file da scrivere su Drive, può metterci più di trenta secondi.
        Timeout = TimeSpan.FromSeconds(120),
    };

    public Foglio(Configurazione config) => this.config = config;

    public async Task<(int Stato, string Json)> LeggiAsync(string azione, IEnumerable<KeyValuePair<string, string>> parametri)
    {
        if (!config.Configurato) return NonConfigurato();
        var query = new StringBuilder("?codice=").Append(Uri.EscapeDataString(config.Codice))
            .Append("&azione=").Append(Uri.EscapeDataString(azione));
        foreach (var (k, v) in parametri)
        {
            if (k is "codice" or "azione") continue;
            query.Append('&').Append(Uri.EscapeDataString(k)).Append('=').Append(Uri.EscapeDataString(v));
        }
        var risposta = await ChiamaAsync(() => new HttpRequestMessage(HttpMethod.Get, config.Url + query)).ConfigureAwait(false);
        // Una lettura si può ripetere senza danni: al primo singhiozzo di Google si riprova una volta.
        // (Le scritture no: un invio di email partirebbe due volte.)
        if (risposta.Item1 == 502 && risposta.Item2.Contains("\"rete\":true", StringComparison.Ordinal))
        {
            await Task.Delay(1500).ConfigureAwait(false);
            risposta = await ChiamaAsync(() => new HttpRequestMessage(HttpMethod.Get, config.Url + query)).ConfigureAwait(false);
        }
        return risposta;
    }

    public async Task<(int Stato, string Json)> ScriviAsync(string azione, string? corpo)
    {
        if (!config.Configurato) return NonConfigurato();
        var o = (string.IsNullOrWhiteSpace(corpo) ? null : JsonNode.Parse(corpo) as JsonObject) ?? new JsonObject();
        o["azione"] = azione;
        o["codice"] = config.Codice;
        var testo = o.ToJsonString();
        // text/plain di proposito: Apps Script legge comunque il corpo grezzo.
        return await ChiamaAsync(() => new HttpRequestMessage(HttpMethod.Post, config.Url)
        {
            Content = new StringContent(testo, Encoding.UTF8, "text/plain"),
        }).ConfigureAwait(false);
    }

    /// <summary>Il contenuto di un file di Drive (foto o firma), come lo dà lo script.</summary>
    public async Task<(string Mime, byte[] Dati)?> FileAsync(string id)
    {
        var (stato, json) = await LeggiAsync("file", new[] { KeyValuePair.Create("id", id) }).ConfigureAwait(false);
        if (stato != 200) return null;
        var o = JsonNode.Parse(json) as JsonObject;
        if (o?["ok"]?.GetValue<bool>() != true || o["file"] is not JsonObject f) return null;
        var base64 = f["base64"]?.GetValue<string>();
        if (string.IsNullOrEmpty(base64)) return null;
        return (f["mime"]?.GetValue<string>() ?? "application/octet-stream", Convert.FromBase64String(base64));
    }

    private async Task<(int, string)> ChiamaAsync(Func<HttpRequestMessage> richiesta)
    {
        try
        {
            using var r = await http.SendAsync(richiesta()).ConfigureAwait(false);
            var testo = await r.Content.ReadAsStringAsync().ConfigureAwait(false);
            if (r.StatusCode == System.Net.HttpStatusCode.NotFound)
            {
                // 404 dall'indirizzo scritto: lì non c'è nessuno script, quasi sempre è scritto male.
                // 404 dopo il rimbalzo verso googleusercontent: un singhiozzo di Google (capita
                // per qualche minuto dopo una distribuzione nuova), l'indirizzo è giusto.
                var dopoIlRimbalzo = r.RequestMessage?.RequestUri?.Host.EndsWith("googleusercontent.com", StringComparison.OrdinalIgnoreCase) == true;
                return dopoIlRimbalzo
                    ? (502, Errore("Il foglio non ha risposto bene: riprova fra poco", rete: true))
                    : (502, Errore("A questo indirizzo Google non trova lo script: controlla che sia scritto giusto, lettera per lettera"));
            }
            if (!r.IsSuccessStatusCode) return (502, Errore($"Il foglio ha risposto {(int)r.StatusCode}", rete: true));
            // Se lo script non è pubblicato per "Chiunque", Google risponde con una pagina di accesso.
            if (!testo.TrimStart().StartsWith('{')) return (502, Errore("Risposta non valida dal foglio: lo script è pubblicato per \"Chiunque\"?"));
            return (200, testo);
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException or IOException)
        {
            Log.Errore("foglio non raggiunto", e);
            return (502, Errore(e is TaskCanceledException ? "Il foglio non ha risposto in tempo" : "Niente rete: il foglio non si raggiunge", rete: true));
        }
    }

    private static (int, string) NonConfigurato() =>
        (409, Errore("Manca il collegamento al foglio: aprilo da Impostazioni"));

    private static string Errore(string messaggio, bool rete = false) =>
        new JsonObject { ["ok"] = false, ["errore"] = messaggio, ["rete"] = rete }.ToJsonString();
}
