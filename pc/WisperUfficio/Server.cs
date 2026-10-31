using System.Diagnostics;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.NetworkInformation;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace WisperUfficio;

/// <summary>
/// Le chiamate al server di Wisper (server/, docs/gestionale/architettura.md §2 e §12),
/// con la chiave d'accesso aggiunta qui. Le risposte passano all'interfaccia così come
/// sono: i conti e i permessi li fa il server, il programma non ne rifà nessuno.
///
/// Le strade per arrivare al server sono due (docs/gestionale/porta-google.md):
///  - in casa, direttamente: GET/POST &lt;casa&gt;/exec, POST /carica, GET /file/&lt;id&gt;, con
///    "Authorization: Bearer" e, nelle POST, l'id della richiesta (idRichiesta);
///  - fuori casa, la porta Google: POST allo script del foglio {porta:1, id, token, strada, ...},
///    che tiene la richiesta finché il server del NAS non viene a prenderla.
/// La regola di casa (§8): si sceglie casa solo se &lt;casa&gt;/salute sa fare la firma col token
/// (solo il server vero la sa fare); altrimenti Google. La scelta vale 5 minuti, si rifà quando
/// cambia la rete, e una richiesta a casa che si perde per strada riparte subito da Google con
/// lo stesso id (il server non la rifà due volte). accedi passa sempre da Google, se c'è.
/// Senza indirizzo Google si va a casa e basta, come prima.
///
/// Se il server dice accesso:false la chiave non vale più: si butta, e l'interfaccia
/// torna alla pagina di accesso.
/// </summary>
public sealed class Server
{
    private readonly Configurazione config;

    /// <summary>Il server di casa. Il tempo lo decide ogni richiesta.</summary>
    private readonly HttpClient casa = new(new SocketsHttpHandler
    {
        AllowAutoRedirect = false,
        ConnectTimeout = TimeSpan.FromSeconds(8),
        PooledConnectionLifetime = TimeSpan.FromMinutes(5),
        PooledConnectionIdleTimeout = TimeSpan.FromSeconds(30),
    })
    {
        Timeout = Timeout.InfiniteTimeSpan,
    };

    /// <summary>La prova di casa (§8.2): 1,5 secondi in tutto, e una risposta piccola.</summary>
    private readonly HttpClient provaCasa = new(new SocketsHttpHandler
    {
        AllowAutoRedirect = false,
        ConnectTimeout = TimeSpan.FromMilliseconds(1500),
        PooledConnectionIdleTimeout = TimeSpan.FromSeconds(30),
    })
    {
        Timeout = TimeSpan.FromMilliseconds(1500),
        MaxResponseContentBufferSize = 64 * 1024,
    };

    /// <summary>
    /// La porta Google. Lo script risponde con un rimbalzo 302 verso script.googleusercontent.com,
    /// che HttpClient segue da solo con una GET: non va forzato (porta-google.md §3).
    /// </summary>
    private readonly HttpClient google = new(new SocketsHttpHandler
    {
        AllowAutoRedirect = true,
        MaxAutomaticRedirections = 5,
        ConnectTimeout = TimeSpan.FromSeconds(15),
        PooledConnectionLifetime = TimeSpan.FromMinutes(5),
        AutomaticDecompression = DecompressionMethods.All,
    })
    {
        Timeout = Timeout.InfiniteTimeSpan,
    };

    /// <summary>Quanto vale la scelta fra casa e Google (§8.3, §8.4).</summary>
    private static readonly TimeSpan DurataScelta = TimeSpan.FromMinutes(5);

    /// <summary>Una richiesta a casa: un PDF con tante foto, o il NAS appena acceso, può metterci un po'.</summary>
    private static readonly TimeSpan TempoCasa = TimeSpan.FromSeconds(90);

    /// <summary>Con Google dietro si aspetta casa un po' meno: se non risponde, la stessa richiesta passa da lì.</summary>
    private static readonly TimeSpan TempoCasaConGoogle = TimeSpan.FromSeconds(55);

    /// <summary>Verso lo script (§3): connessione 15 s e lettura 60 s; per i file grandi di più.</summary>
    private static readonly TimeSpan TempoGoogle = TimeSpan.FromSeconds(75);
    private static readonly TimeSpan TempoGoogleFile = TimeSpan.FromSeconds(120);
    private static readonly TimeSpan TempoGoogleCarica = TimeSpan.FromSeconds(180);

    /// <summary>
    /// "attesa" = la richiesta resta nella coda dello script: la si richiede con lo stesso id,
    /// finché sono passati al massimo questi secondi (l'interfaccia aspetta 150 s in tutto).
    /// </summary>
    private static readonly TimeSpan PazienzaAttesa = TimeSpan.FromSeconds(55);

    /// <summary>Un file più grande di così non passa da Google (§3, §7): si manda dall'ufficio.</summary>
    public const long MassimoDaGoogle = 26_000_000;

    public const string TroppoGrandePerGoogle = "La richiesta è troppo grande per passare da Google (al massimo 26 MB): mandala quando sei in ufficio";

    // La scelta della strada (§8): "casa", "google" o "" (da scegliere). Tutto sotto il lucchetto.
    private readonly object lucchetto = new();
    private string scelta = "";
    private DateTime sceltaFinoA = DateTime.MinValue;
    private int generazione;
    private Task<string>? provaInCorso;
    private string ultimaStrada = "";
    private DateTime? ultimoContatto;

    /// <summary>
    /// Le scritture rimaste senza risposta (rete): se l'interfaccia rimanda la stessa scrittura
    /// (il "Riprova" di chi lavora), riparte con lo stesso id (§5) e il server non la rifà.
    /// </summary>
    private readonly Dictionary<string, (string Id, DateTime Quando)> daRiprovare = new();

    public Server(Configurazione config)
    {
        this.config = config;
        // Wi-Fi o cavo, un'altra rete: la scelta fra casa e Google si rifà (§8.1).
        NetworkChange.NetworkAddressChanged += (_, _) => Dimentica();
    }

    /// <summary>La scelta fra casa e Google si rifà alla prossima richiesta (rete cambiata, chiave nuova).</summary>
    public void Dimentica()
    {
        lock (lucchetto)
        {
            generazione++;
            scelta = "";
        }
    }

    /// <summary>
    /// Per la pagina (Amministrazione e accesso): dove sta il server di casa, se c'è la porta
    /// Google (sì o no: l'indirizzo dello script non esce da qui), la strada di adesso e
    /// l'ultimo contatto riuscito.
    /// </summary>
    public JsonObject Stato()
    {
        lock (lucchetto)
        {
            var valida = scelta.Length > 0 && DateTime.UtcNow < sceltaFinoA;
            var soloUna = config.Google.Length == 0 ? (config.Server.Length > 0 ? "casa" : "") : config.Server.Length == 0 ? "google" : "";
            return new JsonObject
            {
                ["casa"] = config.Server,
                ["google"] = config.Google.Length > 0,
                ["strada"] = soloUna.Length > 0 ? soloUna : valida ? scelta : "",
                ["ultimaStrada"] = ultimaStrada,
                ["ultimoContatto"] = ultimoContatto?.ToString("yyyy-MM-dd'T'HH:mm:ss") ?? "",
            };
        }
    }

    // ------------------------------------------------------------------ le richieste

    /// <summary>
    /// accedi {email, password} con gli indirizzi scritti nella pagina (anche non ancora salvati).
    /// Prima di entrare la firma di casa non si può controllare: se c'è la porta Google, accedi
    /// passa da lì e la password non va mai a un apparecchio di casa non controllato (§8.2).
    /// </summary>
    public async Task<JsonObject> AccediAsync(string indirizzoCasa, string indirizzoGoogle, string email, string password)
    {
        var o = new JsonObject { ["azione"] = "accedi", ["email"] = email, ["password"] = password };
        foreach (var (k, v) in ChiSono()) o[k] = v;
        string testo;
        if (indirizzoGoogle.Length > 0)
        {
            var (rete, t) = await GoogleAsync(indirizzoGoogle, CorpoExec(NuovoId(), "", "POST", o), TempoGoogle, Ripeti.SoloAttesa).ConfigureAwait(false);
            if (!rete) Contatto("google");
            testo = t;
        }
        else
        {
            var d = await CasaAsync(() => new HttpRequestMessage(HttpMethod.Post, indirizzoCasa + "/exec")
            {
                Content = new StringContent(o.ToJsonString(), Encoding.UTF8, "application/json"),
            }, conChiave: false, TempoCasa).ConfigureAwait(false);
            if (d.Arrivata) Contatto("casa");
            testo = d.Testo;
        }
        // Con la chiave nuova si riprova casa alla prossima richiesta.
        Dimentica();
        try
        {
            return JsonNode.Parse(testo) as JsonObject ?? Errore("Risposta non valida dal server");
        }
        catch (JsonException)
        {
            return Errore("Risposta non valida dal server");
        }
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
        var dati = new JsonObject { ["azione"] = azione };
        foreach (var (k, v) in parametri)
        {
            if (k is "azione" or "codice" or "disp" or "dispNome" or "app" or "token" or "idRichiesta") continue;
            dati[k] = v;
        }
        // Per le letture un id nuovo ogni volta va bene (§5).
        var risposta = await ExecAsync("GET", dati, NuovoId()).ConfigureAwait(false);
        // Solo casa: una lettura si può ripetere senza danni, al primo singhiozzo della rete si riprova una volta.
        // (Le scritture no: un invio di email partirebbe due volte. Con Google la seconda strada è già la ripetizione.)
        if (risposta.Stato == 502 && config.Google.Length == 0)
        {
            await Task.Delay(1200).ConfigureAwait(false);
            risposta = await ExecAsync("GET", dati, NuovoId()).ConfigureAwait(false);
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
        catch (JsonException)
        {
            return (400, Errore("Richiesta non valida").ToJsonString());
        }
        o["azione"] = azione;
        // La chiave d'accesso viaggia nell'intestazione (in casa) o nel campo token (Google), mai nei dati.
        o.Remove("token");
        o.Remove("codice");
        o.Remove("idRichiesta");
        var chiave = Impronta("exec\n" + o.ToJsonString());
        var id = IdPer(chiave);
        var risposta = await ExecAsync("POST", o, id).ConfigureAwait(false);
        Ricorda(chiave, id, risposta.Stato == 502);
        return risposta;
    }

    /// <summary>
    /// Un file (foto, firma, documento). Stato 200 coi byte; 401 se la chiave non vale più (e si
    /// butta), 403, 404, 413 (troppo grande per Google), 502 se il server non si raggiunge; Errore a parole.
    /// </summary>
    public async Task<(int Stato, string Mime, byte[] Dati, string Errore)> FileAsync(string id)
    {
        config.RileggiSeCambiato();
        if (!config.Entrato) return (401, "text/plain", Array.Empty<byte>(), "Accesso scaduto: entra di nuovo");
        var idRichiesta = NuovoId();
        var conGoogle = config.Google.Length > 0;
        if (await StradaAsync().ConfigureAwait(false) == "casa")
        {
            try
            {
                using var rq = new HttpRequestMessage(HttpMethod.Get, config.Server + "/file/" + Uri.EscapeDataString(id));
                rq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", config.Token);
                rq.Headers.Add("X-Wisper-Disp", config.Dispositivo);
                rq.Headers.Add("X-Wisper-App", "ufficio " + Versione);
                using var tempo = new CancellationTokenSource(TempoCasa);
                using var r = await casa.SendAsync(rq, HttpCompletionOption.ResponseHeadersRead, tempo.Token).ConfigureAwait(false);
                var codice = (int)r.StatusCode;
                if (codice == 200)
                {
                    var dati = await r.Content.ReadAsByteArrayAsync(tempo.Token).ConfigureAwait(false);
                    Contatto("casa");
                    return (200, r.Content.Headers.ContentType?.MediaType ?? "application/octet-stream", dati, "");
                }
                // 401, 403 e 404 sono risposte del server, non la rete.
                if (codice is 401 or 403 or 404)
                {
                    Contatto("casa");
                    if (codice == 401) config.Esci();
                    return (codice, "text/plain", Array.Empty<byte>(), ErroreFile(codice));
                }
                if (!conGoogle) return (codice, "text/plain", Array.Empty<byte>(), "Il server ha risposto " + codice);
                Log.Info("file: il server di casa ha risposto " + codice + ", passo da Google");
            }
            catch (Exception e) when (ÈRete(e))
            {
                Log.Errore("file non scaricato da casa", e);
                if (!conGoogle) return (502, "text/plain", Array.Empty<byte>(), "Il server non risponde: controlla la rete e riprova");
            }
            PassaAGoogle();
        }
        if (!conGoogle) return (502, "text/plain", Array.Empty<byte>(), "Manca l'indirizzo del server");

        var corpo = new JsonObject
        {
            ["porta"] = 1, ["id"] = idRichiesta, ["token"] = config.Token, ["strada"] = "file", ["file"] = id,
            ["disp"] = config.Dispositivo, ["dispNome"] = Configurazione.NomeDispositivo, ["app"] = "ufficio " + Versione,
        };
        var (rete, testo) = await GoogleAsync(config.Google, corpo, TempoGoogleFile, Ripeti.Tutto).ConfigureAwait(false);
        if (rete) return (502, "text/plain", Array.Empty<byte>(), ErroreDi(testo));
        Contatto("google");
        try
        {
            var o = JsonNode.Parse(testo) as JsonObject;
            if (o?["ok"]?.GetValueKind() == JsonValueKind.True)
            {
                var dati = Convert.FromBase64String(Testo(o["base64"]));
                var mime = Testo(o["mime"]);
                return (200, mime.Length > 0 ? mime : "application/octet-stream", dati, "");
            }
            var stato = o?["stato"] is JsonValue sv && sv.TryGetValue<int>(out var s) ? s : 404;
            if (stato == 401 || o?["accesso"]?.GetValueKind() == JsonValueKind.False)
            {
                config.Esci();
                return (401, "text/plain", Array.Empty<byte>(), "Accesso scaduto: entra di nuovo");
            }
            var errore = ErroreDi(testo);
            return (stato, "text/plain", Array.Empty<byte>(), errore.Length > 0 ? errore : ErroreFile(stato));
        }
        catch (Exception e) when (e is JsonException or FormatException or InvalidOperationException)
        {
            Log.Errore("file arrivato rovinato da Google", e);
            return (502, "text/plain", Array.Empty<byte>(), "Il file non è arrivato intero: riprova");
        }
    }

    /// <summary>
    /// Fase 5: un file in byte al server (POST /carica?nome=&amp;mime=&amp;idFile=&amp;per=), letto dal disco o da
    /// quello che la pagina ha trascinato. In casa parte in byte senza tenerlo tutto in memoria; da Google
    /// passa intero in base64 (strada "carica"), fino a 26 MB. La risposta è quella del server
    /// ({ok, file, gia} o l'errore), come per /exec.
    /// </summary>
    public async Task<(int Stato, string Json)> CaricaAsync(Stream dati, long? lunghezza, string nome, string mime, string idFile, string per)
    {
        config.RileggiSeCambiato();
        if (!config.Entrato) return Uscito();
        var chiave = Impronta("carica\n" + nome + "\n" + mime + "\n" + per + "\n" + idFile + "\n" + (lunghezza?.ToString(System.Globalization.CultureInfo.InvariantCulture) ?? "?"));
        var id = IdPer(chiave);
        // Lo stesso idFile ridà lo stesso file: se la pagina non l'ha dato ne nasce uno dall'id della
        // richiesta, così una ripetizione (anche da casa a Google) non lo carica due volte.
        if (idFile.Length == 0) idFile = "pc-" + id;
        var risposta = await CaricaPerStradaAsync(dati, lunghezza, nome, mime, idFile, per, id).ConfigureAwait(false);
        Ricorda(chiave, id, risposta.Stato == 502);
        return risposta;
    }

    private async Task<(int Stato, string Json)> CaricaPerStradaAsync(Stream dati, long? lunghezza, string nome, string mime, string idFile, string per, string id)
    {
        var conGoogle = config.Google.Length > 0;
        MemoryStream? copia = null;
        try
        {
            if (await StradaAsync().ConfigureAwait(false) == "casa")
            {
                // Per poterlo rimandare da Google se la rete di casa cade a metà, il file deve poter ripartire dall'inizio.
                if (conGoogle && !dati.CanSeek)
                {
                    copia = new MemoryStream();
                    await dati.CopyToAsync(copia).ConfigureAwait(false);
                    copia.Position = 0;
                    dati = copia;
                    lunghezza = copia.Length;
                }
                var inizio = dati.CanSeek ? dati.Position : 0;
                var d = await CaricaCasaAsync(dati, lunghezza, nome, mime, idFile, per).ConfigureAwait(false);
                if (d.Arrivata && (d.Http200 || !conGoogle))
                {
                    Contatto("casa");
                    return Risposta(d.Testo);
                }
                if (!conGoogle) return (502, d.Testo);
                PassaAGoogle();
                if (!dati.CanSeek) return (502, d.Testo);
                dati.Position = inizio;
            }
            if (!conGoogle) return (502, Errore("Manca l'indirizzo del server", rete: true).ToJsonString());

            // Da Google il file passa intero, in base64 (§3, §7).
            if (lunghezza is long n && n > MassimoDaGoogle) return (200, Errore(TroppoGrandePerGoogle).ToJsonString());
            using var tutto = new MemoryStream();
            var pezzo = new byte[81920];
            int letti;
            while ((letti = await dati.ReadAsync(pezzo).ConfigureAwait(false)) > 0)
            {
                tutto.Write(pezzo, 0, letti);
                if (tutto.Length > MassimoDaGoogle) return (200, Errore(TroppoGrandePerGoogle).ToJsonString());
            }
            var corpo = new JsonObject
            {
                ["porta"] = 1, ["id"] = id, ["token"] = config.Token, ["strada"] = "carica",
                ["query"] = new JsonObject { ["nome"] = nome, ["mime"] = mime, ["idFile"] = idFile, ["per"] = per },
                ["disp"] = config.Dispositivo, ["dispNome"] = Configurazione.NomeDispositivo, ["app"] = "ufficio " + Versione,
                ["base64"] = Convert.ToBase64String(tutto.GetBuffer(), 0, (int)tutto.Length),
            };
            // Rimandare 30 MB per un singhiozzo no: si ripete solo quando lo script la tiene in coda ("attesa").
            var (rete, testo) = await GoogleAsync(config.Google, corpo, TempoGoogleCarica, Ripeti.SoloAttesa).ConfigureAwait(false);
            if (rete) return (502, testo);
            Contatto("google");
            return Risposta(testo);
        }
        finally
        {
            copia?.Dispose();
        }
    }

    private async Task<DaCasa> CaricaCasaAsync(Stream dati, long? lunghezza, string nome, string mime, string idFile, string per)
    {
        var q = new StringBuilder("?nome=").Append(Uri.EscapeDataString(nome))
            .Append("&mime=").Append(Uri.EscapeDataString(mime))
            .Append("&per=").Append(Uri.EscapeDataString(per));
        if (idFile.Length > 0) q.Append("&idFile=").Append(Uri.EscapeDataString(idFile));
        try
        {
            // Niente "using" sulla richiesta: chiuderla chiuderebbe anche il file, che potrebbe dover ripartire da Google.
            var rq = new HttpRequestMessage(HttpMethod.Post, config.Server + "/carica" + q);
            rq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", config.Token);
            rq.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
            rq.Headers.Add("X-Wisper-Disp", config.Dispositivo);
            rq.Headers.Add("X-Wisper-App", "ufficio " + Versione);
            var corpo = new StreamContent(dati, 81920);
            corpo.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
            if (lunghezza is long n) corpo.Headers.ContentLength = n;
            rq.Content = corpo;
            // Un file grande su una rete lenta può metterci più delle chiamate normali.
            using var tempo = new CancellationTokenSource(TimeSpan.FromMinutes(15));
            using var r = await casa.SendAsync(rq, tempo.Token).ConfigureAwait(false);
            var testo = await r.Content.ReadAsStringAsync(tempo.Token).ConfigureAwait(false);
            if (!testo.TrimStart().StartsWith('{')) return new DaCasa(false, false, Errore($"Il server ha risposto {(int)r.StatusCode}", rete: true).ToJsonString());
            return new DaCasa(true, r.StatusCode == HttpStatusCode.OK, testo);
        }
        catch (Exception e) when (ÈRete(e))
        {
            Log.Errore("file non caricato a casa", e);
            return new DaCasa(false, false, Errore(e is TaskCanceledException or OperationCanceledException ? "Il file non è arrivato in tempo: riprova" : "Il server non risponde: controlla la rete e riprova", rete: true).ToJsonString());
        }
    }

    // ------------------------------------------------------------------ /exec per la strada scelta

    private async Task<(int Stato, string Json)> ExecAsync(string metodo, JsonObject dati, string id)
    {
        var conGoogle = config.Google.Length > 0;
        if (await StradaAsync().ConfigureAwait(false) == "casa")
        {
            var indirizzo = config.Server;
            var d = await CasaAsync(() => RichiestaCasa(indirizzo, metodo, dati, id), conChiave: true, conGoogle ? TempoCasaConGoogle : TempoCasa).ConfigureAwait(false);
            if (d.Arrivata && (d.Http200 || !conGoogle))
            {
                Contatto("casa");
                return Risposta(d.Testo);
            }
            if (!conGoogle) return (502, d.Testo);
            // §8.5: la scelta passa subito a Google e la stessa richiesta parte da lì, con lo stesso id.
            Log.Info("il server di casa non ha risposto: passo da Google con la stessa richiesta");
            PassaAGoogle();
        }
        if (!conGoogle) return (502, Errore("Manca l'indirizzo del server", rete: true).ToJsonString());
        var (rete, testo) = await GoogleAsync(config.Google, CorpoExec(id, config.Token, metodo, dati), TempoGoogle, Ripeti.Tutto).ConfigureAwait(false);
        if (rete) return (502, testo);
        Contatto("google");
        return Risposta(testo);
    }

    /// <summary>La richiesta a &lt;casa&gt;/exec: le letture con GET e i parametri, le scritture con POST e idRichiesta (§5).</summary>
    private static HttpRequestMessage RichiestaCasa(string indirizzo, string metodo, JsonObject dati, string id)
    {
        if (metodo == "GET")
        {
            var query = new StringBuilder();
            foreach (var (k, v) in dati)
                query.Append(query.Length == 0 ? '?' : '&').Append(Uri.EscapeDataString(k)).Append('=').Append(Uri.EscapeDataString(Testo(v)));
            return new HttpRequestMessage(HttpMethod.Get, indirizzo + "/exec" + query);
        }
        var o = (JsonObject)dati.DeepClone();
        o["idRichiesta"] = id;
        return new HttpRequestMessage(HttpMethod.Post, indirizzo + "/exec")
        {
            Content = new StringContent(o.ToJsonString(), Encoding.UTF8, "application/json"),
        };
    }

    private static JsonObject CorpoExec(string id, string token, string metodo, JsonObject dati) => new()
    {
        ["porta"] = 1,
        ["id"] = id,
        ["token"] = token,
        ["strada"] = "exec",
        ["metodo"] = metodo,
        ["dati"] = dati.DeepClone(),
    };

    /// <summary>Una risposta del server: se dice accesso:false la chiave si butta subito.</summary>
    private (int Stato, string Json) Risposta(string testo)
    {
        if (testo.Contains("\"accesso\":false", StringComparison.Ordinal)) config.Esci();
        return (200, testo);
    }

    // ------------------------------------------------------------------ casa

    /// <summary>
    /// Cosa è tornato da casa. Arrivata = una risposta JSON del server (anche ok:false); Http200 = col
    /// codice 200. Senza risposta (connessione, tempo, una pagina che non è del server) Testo è
    /// l'errore già pronto per l'interfaccia.
    /// </summary>
    private readonly record struct DaCasa(bool Arrivata, bool Http200, string Testo);

    private async Task<DaCasa> CasaAsync(Func<HttpRequestMessage> richiesta, bool conChiave, TimeSpan tempoMassimo)
    {
        try
        {
            using var rq = richiesta();
            if (conChiave) rq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", config.Token);
            rq.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
            using var tempo = new CancellationTokenSource(tempoMassimo);
            using var r = await casa.SendAsync(rq, tempo.Token).ConfigureAwait(false);
            var testo = await r.Content.ReadAsStringAsync(tempo.Token).ConfigureAwait(false);
            if (testo.TrimStart().StartsWith('{')) return new DaCasa(true, r.StatusCode == HttpStatusCode.OK, testo);
            return new DaCasa(false, false, r.StatusCode == HttpStatusCode.NotFound
                ? Errore("A questo indirizzo non risponde un server di Wisper: controlla che sia scritto giusto").ToJsonString()
                : Errore($"Il server ha risposto {(int)r.StatusCode}", rete: true).ToJsonString());
        }
        catch (Exception e) when (ÈRete(e))
        {
            Log.Errore("server di casa non raggiunto", e);
            return new DaCasa(false, false, Errore(e is TaskCanceledException or OperationCanceledException
                ? "Il server non ha risposto in tempo: controlla la rete e riprova"
                : "Il server non risponde: controlla la rete e riprova", rete: true).ToJsonString());
        }
    }

    // ------------------------------------------------------------------ la regola di casa (§8)

    /// <summary>"casa" o "google" (o "" se non c'è nessun indirizzo): la strada per questa richiesta.</summary>
    private async Task<string> StradaAsync()
    {
        var indirizzoCasa = config.Server;
        var indirizzoGoogle = config.Google;
        // Senza indirizzo Google: solo casa, come prima. Senza indirizzo di casa: solo Google.
        if (indirizzoGoogle.Length == 0) return indirizzoCasa.Length > 0 ? "casa" : "";
        if (indirizzoCasa.Length == 0) return "google";
        var token = config.Token;
        if (token.Length == 0) return "google";
        Task<string> prova;
        lock (lucchetto)
        {
            if (scelta.Length > 0 && DateTime.UtcNow < sceltaFinoA) return scelta;
            if (provaInCorso == null)
            {
                var gen = generazione;
                provaInCorso = Task.Run(() => ProvaCasaAsync(indirizzoCasa, token, gen));
            }
            prova = provaInCorso;
        }
        return await prova.ConfigureAwait(false);
    }

    private async Task<string> ProvaCasaAsync(string indirizzoCasa, string token, int gen)
    {
        var esito = "google";
        try
        {
            if (await FirmaDiCasaAsync(indirizzoCasa, token).ConfigureAwait(false)) esito = "casa";
        }
        finally
        {
            lock (lucchetto)
            {
                provaInCorso = null;
                // La rete è cambiata mentre si provava: la prova non vale per quella nuova.
                if (gen == generazione) Scegli(esito);
            }
        }
        return esito;
    }

    /// <summary>
    /// GET &lt;casa&gt;/salute?prova=P&amp;chi=C, 1,5 secondi in tutto. Vale casa solo con HTTP 200, ok:true e
    /// firma = HMAC-SHA256(chiave: SHA-256(token) in esadecimale minuscolo come testo, messaggio: P).
    /// Il token non parte mai: un altro apparecchio con lo stesso indirizzo (un albergo, un cliente)
    /// non sa fare la firma.
    /// </summary>
    private async Task<bool> FirmaDiCasaAsync(string indirizzoCasa, string token)
    {
        var prova = Casuale(32);
        var impronta = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token))).ToLowerInvariant();
        try
        {
            using var tempo = new CancellationTokenSource(TimeSpan.FromMilliseconds(1500));
            using var r = await provaCasa.GetAsync(indirizzoCasa + "/salute?prova=" + prova + "&chi=" + impronta[..16], tempo.Token).ConfigureAwait(false);
            if (r.StatusCode != HttpStatusCode.OK) return false;
            var o = JsonNode.Parse(await r.Content.ReadAsStringAsync(tempo.Token).ConfigureAwait(false)) as JsonObject;
            if (o?["ok"]?.GetValueKind() != JsonValueKind.True) return false;
            var firma = o["firma"]?.GetValueKind() == JsonValueKind.String ? o["firma"]!.GetValue<string>() : "";
            var giusta = Convert.ToHexString(HMACSHA256.HashData(Encoding.UTF8.GetBytes(impronta), Encoding.UTF8.GetBytes(prova))).ToLowerInvariant();
            return firma.Length == giusta.Length &&
                CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(firma), Encoding.ASCII.GetBytes(giusta));
        }
        catch (Exception e) when (ÈRete(e) || e is JsonException)
        {
            return false;
        }
    }

    /// <summary>Dentro il lucchetto: la strada per i prossimi 5 minuti.</summary>
    private void Scegli(string strada)
    {
        if (strada != scelta) Log.Info(strada == "casa" ? "collegamento: in ufficio, direttamente al server di casa" : "collegamento: via Google");
        scelta = strada;
        sceltaFinoA = DateTime.UtcNow + DurataScelta;
    }

    private void PassaAGoogle()
    {
        lock (lucchetto) Scegli("google");
    }

    /// <summary>Il server ha risposto: è l'ultimo contatto. Da casa rinnova i 5 minuti (§8.3).</summary>
    private void Contatto(string strada)
    {
        lock (lucchetto)
        {
            ultimaStrada = strada;
            ultimoContatto = DateTime.Now;
            if (strada == "casa" && scelta == "casa") sceltaFinoA = DateTime.UtcNow + DurataScelta;
        }
    }

    // ------------------------------------------------------------------ la porta Google (§3, §4)

    private enum Ripeti { SoloAttesa, Tutto }

    /// <summary>
    /// Una richiesta allo script, sempre col corpo di prima (lo stesso id a ogni tentativo).
    /// Rete = la risposta non è del server: "attesa" (la richiesta resta in coda) si richiede con lo
    /// stesso id per un po'; "occupato", 429 o una pagina HTML una volta sola dopo una pausa (Tutto);
    /// "spento" e la rete che manca si dicono subito. Il testo degli errori di Google resta com'è.
    /// </summary>
    private async Task<(bool Rete, string Testo)> GoogleAsync(string indirizzo, JsonObject corpo, TimeSpan tempo, Ripeti ripeti)
    {
        var testo = corpo.ToJsonString();
        var orologio = Stopwatch.StartNew();
        for (var tentativo = 1; ; tentativo++)
        {
            var (rete, risposta, porta) = await UnaVoltaGoogleAsync(indirizzo, testo, tempo).ConfigureAwait(false);
            if (!rete) return (false, risposta);
            var ancora = porta == "attesa"
                ? orologio.Elapsed < PazienzaAttesa
                : porta is "occupato" or "pagina" && ripeti == Ripeti.Tutto && tentativo < 2;
            if (!ancora) return (true, risposta);
            Log.Info("porta Google: " + porta + ", riprovo con lo stesso id");
            if (porta != "attesa") await Task.Delay(2000).ConfigureAwait(false);
        }
    }

    private async Task<(bool Rete, string Testo, string Porta)> UnaVoltaGoogleAsync(string indirizzo, string corpo, TimeSpan tempoMassimo)
    {
        try
        {
            // text/plain: niente preflight, e lo script legge il corpo grezzo. Il token sta nel corpo (Apps Script non legge le intestazioni).
            using var rq = new HttpRequestMessage(HttpMethod.Post, indirizzo) { Content = new StringContent(corpo, Encoding.UTF8, "text/plain") };
            rq.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
            using var tempo = new CancellationTokenSource(tempoMassimo);
            using var r = await google.SendAsync(rq, tempo.Token).ConfigureAwait(false);
            var testo = await r.Content.ReadAsStringAsync(tempo.Token).ConfigureAwait(false);
            if (r.StatusCode == (HttpStatusCode)429)
                return (true, Errore("Troppe richieste insieme: riprova fra poco", rete: true).ToJsonString(), "occupato");
            JsonObject? o = null;
            if (r.StatusCode == HttpStatusCode.OK && testo.TrimStart().StartsWith('{'))
            {
                try { o = JsonNode.Parse(testo) as JsonObject; }
                catch (JsonException) { o = null; }
            }
            // Una pagina HTML (lo script si è fermato, una quota di Google) o un altro codice: rete anche questa (§4).
            if (o == null) return (true, Errore("Google non ha risposto come doveva: riprova fra poco", rete: true).ToJsonString(), "pagina");
            if (o["rete"]?.GetValueKind() == JsonValueKind.True)
            {
                o["ok"] = false;
                if (o["errore"] == null) o["errore"] = "Il server dello studio non risponde: riprova fra poco";
                var porta = Testo(o["porta"]);
                return (true, o.ToJsonString(), porta.Length > 0 ? porta : "rete");
            }
            return (false, testo, "");
        }
        catch (Exception e) when (ÈRete(e))
        {
            // Solo il tipo: l'indirizzo dello script non va nel registro.
            Log.Errore("porta Google non raggiunta: " + (e is HttpRequestException h ? h.HttpRequestError.ToString() : e.GetType().Name));
            var scaduto = e is TaskCanceledException or OperationCanceledException;
            return (true, Errore(scaduto ? "Google non ha risposto in tempo: riprova fra poco" : "Non riesco a raggiungere Google: controlla la rete e riprova", rete: true).ToJsonString(), scaduto ? "tempo" : "connessione");
        }
    }

    // ------------------------------------------------------------------ gli id (§5)

    private const string Lettere = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

    /// <summary>Un id nuovo e casuale per ogni operazione: 16 caratteri [A-Za-z0-9_-].</summary>
    public static string NuovoId() => Casuale(16);

    private static string Casuale(int lunghezza) => RandomNumberGenerator.GetString(Lettere, lunghezza);

    private static string Impronta(string testo) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(testo)));

    /// <summary>L'id per questa scrittura: quello di prima se la stessa è rimasta senza risposta da poco, se no uno nuovo.</summary>
    private string IdPer(string chiave)
    {
        lock (daRiprovare)
        {
            var ora = DateTime.UtcNow;
            foreach (var vecchia in daRiprovare.Where(x => ora - x.Value.Quando > TimeSpan.FromMinutes(10)).Select(x => x.Key).ToList())
                daRiprovare.Remove(vecchia);
            return daRiprovare.TryGetValue(chiave, out var v) ? v.Id : NuovoId();
        }
    }

    private void Ricorda(string chiave, string id, bool senzaRisposta)
    {
        lock (daRiprovare)
        {
            if (senzaRisposta) daRiprovare[chiave] = (id, DateTime.UtcNow);
            else daRiprovare.Remove(chiave);
        }
    }

    // ------------------------------------------------------------------ piccole cose

    private static bool ÈRete(Exception e) =>
        e is HttpRequestException or TaskCanceledException or OperationCanceledException or IOException or UriFormatException or InvalidOperationException;

    private static string ErroreFile(int stato) => stato switch
    {
        401 => "Accesso scaduto: entra di nuovo",
        403 => "Non hai il permesso per vedere questo file",
        413 => "Il file è troppo grande per passare da Google: aprilo quando sei in ufficio",
        _ => "File non trovato",
    };

    private static string ErroreDi(string json)
    {
        try { return Testo((JsonNode.Parse(json) as JsonObject)?["errore"]); }
        catch (JsonException) { return ""; }
    }

    private static string Testo(JsonNode? n)
    {
        if (n == null) return "";
        try
        {
            return n.GetValueKind() == JsonValueKind.String ? n.GetValue<string>() : n.ToJsonString();
        }
        catch (InvalidOperationException)
        {
            return "";
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
