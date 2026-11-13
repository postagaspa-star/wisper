using System.Diagnostics;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;

namespace WisperUfficio;

/// <summary>
/// Wisper Ufficio si aggiorna da solo quando il NAS annuncia una versione nuova (docs/gestionale/progetti.md §6, dal
/// 03/11/2026): il server mette "versioni" in ogni risposta e sul campanello (Server.cs); se la versione del computer è
/// più nuova di questa, il controllo parte una volta per versione. Niente più controllo ogni ora; "Controlla" a mano resta.
///
/// Il controllo chiede a GitHub, alla pagina delle versioni del progetto, il file
/// aggiornamento.json: dentro c'è l'elenco delle versioni, firmato con la chiave
/// privata di chi pubblica (in wisper-keys, mai nel repo). Se la firma non torna
/// non si scarica niente: un account GitHub rubato non basta per mettere un
/// programma su questo computer. Se c'è una versione più nuova si scarica l'exe,
/// si controlla che sia proprio quello dell'elenco (SHA-256) e lo si mette al
/// posto di quello in uso: Windows lascia rinominare un exe mentre gira. La
/// versione nuova parte alla prossima apertura, o subito con "Riavvia".
/// </summary>
public sealed class Aggiornamenti
{
    public const string IndirizzoPredefinito = "https://github.com/postagaspa-star/wisper/releases/latest/download/aggiornamento.json";

    /// <summary>La chiave pubblica (wisper-keys/aggiornamenti-pubblica.txt): valgono solo gli elenchi firmati con la sua privata.</summary>
    private const string ChiavePubblica = "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEcytO0JAM8WZdBrGMSdnF211vK29aUdNOIhPaPpG9XOj3qSd0aKRi8GRmLsxNAbvTmgbvJ9uZ6gjI7euYqqfC7Q==";

    /// <summary>Se il controllo di una versione annunciata non è andato (rete, GitHub), lo stesso annuncio lo rifà al più presto dopo un'ora.</summary>
    private static readonly TimeSpan RiprovaDopo = TimeSpan.FromHours(1);
    private const long DimensioneMassima = 400_000_000;

    private readonly string indirizzo;
    private readonly string? exe;
    private readonly HttpClient http = new() { Timeout = TimeSpan.FromMinutes(10) };
    private readonly SemaphoreSlim unoAllaVolta = new(1, 1);

    // L'ultima versione annunciata dal server per cui si è fatto partire il controllo, e quando.
    private readonly object lucchettoAnnuncio = new();
    private string versioneAnnunciata = "";
    private DateTime annunciataIl = DateTime.MinValue;

    public Version Attuale { get; } = typeof(Aggiornamenti).Assembly.GetName().Version ?? new Version(0, 0, 0);

    /// <summary>"nessuno", "controllo", "scarico", "pronto" (l'exe nuovo è già al suo posto) o "errore".</summary>
    public string Stato { get; private set; } = "nessuno";
    public string? VersioneNuova { get; private set; }
    public string Messaggio { get; private set; } = "";
    public DateTime? UltimoControllo { get; private set; }

    /// <summary>La versione nuova è al suo posto: parte riaprendo il programma.</summary>
    public event Action<string>? Pronta;

    /// <param name="indirizzo">aggiornamento.json (un altro solo per le prove).</param>
    /// <param name="exe">L'exe da sostituire; null se questo non è il programma in un file solo (build di sviluppo).</param>
    public Aggiornamenti(string indirizzo, string? exe)
    {
        this.indirizzo = indirizzo;
        this.exe = exe;
        http.DefaultRequestHeaders.UserAgent.ParseAdd("WisperUfficio/" + Attuale.ToString(3));
    }

    public bool Attivi => exe != null;

    public string VersioneAttuale => Attuale.ToString(3);

    /// <summary>
    /// All'avvio solo le pulizie dell'aggiornamento di prima. Il controllo lo fa partire il server (Annunciata) o la
    /// persona ("Controlla"): il giro di ogni ora non c'è più (progetti.md §6).
    /// </summary>
    public void Avvia()
    {
        if (exe == null)
        {
            Log.Info("aggiornamenti spenti: non è il programma in un file solo");
            return;
        }
        PulisciAvanzi();
    }

    /// <summary>
    /// Il server ha annunciato la versione del computer (in una risposta o dal campanello). Se è più nuova di questa, il
    /// controllo (elenco firmato su GitHub, SHA-256, sostituzione) parte una volta per versione, senza mostrare niente; la
    /// versione nuova parte alla prossima apertura, come prima. Se quella volta non va (rete, GitHub), lo stesso annuncio
    /// lo rifà al più presto dopo un'ora.
    /// </summary>
    public void Annunciata(string versione, string fonte)
    {
        if (!Version.TryParse(versione, out var v) || v <= Attuale) return;
        var chiave = v.ToString();
        lock (lucchettoAnnuncio)
        {
            if (chiave == versioneAnnunciata && (Stato is "pronto" or "controllo" or "scarico" || DateTime.UtcNow - annunciataIl < RiprovaDopo)) return;
            versioneAnnunciata = chiave;
            annunciataIl = DateTime.UtcNow;
        }
        if (exe == null)
        {
            Log.Info("il server annuncia la versione " + chiave + " (" + fonte + "): aggiornamenti spenti, non è il programma in un file solo");
            return;
        }
        if (Stato == "pronto") return;
        Log.Info("il server annuncia la versione " + chiave + " (" + fonte + "): controllo l'elenco delle versioni");
        _ = Task.Run(ControllaAsync);
    }

    /// <summary>Chiede se c'è una versione nuova e, se c'è, la scarica e la mette al suo posto.</summary>
    public async Task ControllaAsync()
    {
        if (exe == null || Stato == "pronto") return;
        if (!await unoAllaVolta.WaitAsync(0).ConfigureAwait(false)) return;
        try
        {
            Stato = "controllo";
            var testo = await http.GetStringAsync(indirizzo).ConfigureAwait(false);
            UltimoControllo = DateTime.Now;
            var (manifesto, firma) = Leggi(testo);
            if (!FirmaValida(manifesto, firma)) throw new InvalidDataException("l'elenco delle versioni non ha una firma valida");

            var computer = JsonNode.Parse(manifesto)?["computer"];
            var nuova = Version.TryParse(computer?["versione"]?.GetValue<string>(), out var v) ? v : null;
            if (nuova == null || nuova <= Attuale)
            {
                Stato = "nessuno";
                Messaggio = "Hai l'ultima versione";
                return;
            }

            var url = computer!["url"]?.GetValue<string>() ?? "";
            var sha = (computer["sha256"]?.GetValue<string>() ?? "").ToLowerInvariant();
            var dimensione = computer["dimensione"]?.GetValue<long>() ?? 0;
            if (!IndirizzoAmmesso(url) || sha.Length != 64 || dimensione <= 0 || dimensione > DimensioneMassima)
                throw new InvalidDataException("l'elenco delle versioni è incompleto");

            Stato = "scarico";
            Messaggio = "Scarico la versione " + nuova.ToString(3);
            Log.Info("aggiornamento: scarico " + nuova.ToString(3));
            var scaricato = exe + ".nuovo";
            await ScaricaAsync(url, scaricato, sha, dimensione).ConfigureAwait(false);
            Sostituisci(scaricato);

            VersioneNuova = nuova.ToString(3);
            Stato = "pronto";
            // 13/11/2026: "pronta" sembrava "già in uso"; finché non si riavvia si usa ancora quella di prima.
            Messaggio = "La versione " + VersioneNuova + " è scaricata: riavvia Wisper Ufficio per usarla";
            Log.Info("aggiornamento pronto: " + VersioneNuova);
            Pronta?.Invoke(VersioneNuova);
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException)
        {
            // Senza rete si riprova al prossimo annuncio del server (al più presto fra un'ora), senza disturbare nessuno.
            Stato = "nessuno";
            Messaggio = "Non ho raggiunto il server degli aggiornamenti";
            Log.Info("aggiornamenti: server non raggiunto (" + e.Message + ")");
        }
        catch (UnauthorizedAccessException e)
        {
            Stato = "errore";
            Messaggio = "C'è una versione nuova, ma qui non posso sostituirmi: sposta WisperUfficio.exe sul Desktop o in Documenti";
            Log.Errore("aggiornamento non applicato", e);
        }
        catch (Exception e)
        {
            Stato = "errore";
            Messaggio = "L'aggiornamento non è andato: riprovo più tardi";
            Log.Errore("aggiornamento non riuscito", e);
        }
        finally
        {
            unoAllaVolta.Release();
        }
    }

    /// <summary>aggiornamento.json: { "manifesto": "&lt;json come testo&gt;", "firma": "&lt;base64&gt;" }.</summary>
    internal static (string Manifesto, string Firma) Leggi(string testo)
    {
        var o = JsonNode.Parse(testo);
        return (o?["manifesto"]?.GetValue<string>() ?? "", o?["firma"]?.GetValue<string>() ?? "");
    }

    internal static bool FirmaValida(string manifesto, string firma)
    {
        if (manifesto.Length == 0 || firma.Length == 0) return false;
        try
        {
            using var ecdsa = ECDsa.Create();
            ecdsa.ImportSubjectPublicKeyInfo(Convert.FromBase64String(ChiavePubblica), out _);
            return ecdsa.VerifyData(Encoding.UTF8.GetBytes(manifesto), Convert.FromBase64String(firma),
                HashAlgorithmName.SHA256, DSASignatureFormat.Rfc3279DerSequence);
        }
        catch (FormatException)
        {
            return false;
        }
    }

    /// <summary>Si scarica solo in https; in chiaro solo dal computer stesso, e solo per le prove.</summary>
    private bool IndirizzoAmmesso(string url)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var u)) return false;
        if (u.Scheme == Uri.UriSchemeHttps) return true;
        return u.Scheme == Uri.UriSchemeHttp && u.IsLoopback &&
               Uri.TryCreate(indirizzo, UriKind.Absolute, out var m) && m.IsLoopback;
    }

    private async Task ScaricaAsync(string url, string destinazione, string sha, long dimensione)
    {
        using var risposta = await http.GetAsync(url, HttpCompletionOption.ResponseHeadersRead).ConfigureAwait(false);
        risposta.EnsureSuccessStatusCode();
        using var hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
        long scritti = 0;
        await using (var dentro = await risposta.Content.ReadAsStreamAsync().ConfigureAwait(false))
        await using (var fuori = new FileStream(destinazione, FileMode.Create, FileAccess.Write, FileShare.None))
        {
            var buffer = new byte[81920];
            int letti;
            while ((letti = await dentro.ReadAsync(buffer).ConfigureAwait(false)) > 0)
            {
                scritti += letti;
                if (scritti > dimensione) break;
                hash.AppendData(buffer, 0, letti);
                await fuori.WriteAsync(buffer.AsMemory(0, letti)).ConfigureAwait(false);
            }
        }
        var impronta = Convert.ToHexString(hash.GetHashAndReset()).ToLowerInvariant();
        if (scritti != dimensione || impronta != sha)
        {
            TryDelete(destinazione);
            throw new InvalidDataException("il file scaricato non è quello dell'elenco delle versioni");
        }
    }

    /// <summary>L'exe in uso diventa .vecchio, quello nuovo prende il suo nome.</summary>
    private void Sostituisci(string scaricato)
    {
        var vecchio = exe + ".vecchio";
        TryDelete(vecchio);
        File.Move(exe!, vecchio);
        try
        {
            File.Move(scaricato, exe!);
        }
        catch
        {
            File.Move(vecchio, exe!);
            throw;
        }
    }

    /// <summary>All'avvio: via l'exe vecchio dell'aggiornamento precedente e gli scaricamenti a metà.</summary>
    private void PulisciAvanzi()
    {
        _ = Task.Run(async () =>
        {
            // Il programma vecchio può metterci qualche secondo a chiudersi.
            for (int i = 0; i < 10; i++)
            {
                if (TryDelete(exe + ".vecchio") & TryDelete(exe + ".nuovo")) return;
                await Task.Delay(2000).ConfigureAwait(false);
            }
        });
    }

    private static bool TryDelete(string file)
    {
        try
        {
            if (File.Exists(file)) File.Delete(file);
            return true;
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            return false;
        }
    }

    /// <summary>Riapre il programma (la versione nuova) e chiude questo.</summary>
    public void Riavvia(IEnumerable<string> argomenti)
    {
        if (exe == null) return;
        var avvio = new ProcessStartInfo(exe) { UseShellExecute = false };
        avvio.ArgumentList.Add("--attendi");
        avvio.ArgumentList.Add(Environment.ProcessId.ToString(System.Globalization.CultureInfo.InvariantCulture));
        foreach (var a in argomenti) avvio.ArgumentList.Add(a);
        Process.Start(avvio)?.Dispose();
        System.Windows.Forms.Application.Exit();
    }

    public JsonObject ComeJson() => new()
    {
        ["attivi"] = Attivi,
        ["versione"] = VersioneAttuale,
        ["stato"] = Stato,
        ["nuova"] = VersioneNuova,
        ["messaggio"] = Messaggio,
        ["controllato"] = UltimoControllo?.ToString("HH:mm"),
    };
}
