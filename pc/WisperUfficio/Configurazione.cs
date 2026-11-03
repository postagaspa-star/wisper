using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace WisperUfficio;

/// <summary>
/// Dove sta il server di Wisper e la chiave d'accesso (il token) che il server dà
/// quando si entra con email e password. Il token sul disco è cifrato con DPAPI
/// dell'utente di Windows: lo può leggere solo questo utente su questo computer.
/// L'interfaccia non lo vede mai: lo aggiunge il ponte a ogni chiamata.
///
/// Gli indirizzi sono due (docs/gestionale/porta-google.md §8): il server di casa
/// (in ufficio, di base http://192.168.1.51:8400) e la porta Google, cioè lo script del
/// foglio che tiene le richieste per il server quando si è fuori casa. Anche l'indirizzo
/// dello script sta cifrato con DPAPI e non arriva mai all'interfaccia né al registro.
///
/// Un file della 0.4 (url dello script, codice) si legge per tenere il nome del
/// dispositivo e l'indirizzo dello script (è la stessa porta Google); il codice no:
/// alla prima scrittura sparisce dal disco.
/// </summary>
public sealed class Configurazione
{
    private readonly string file;

    /// <summary>Il server di casa come è scritto nel file: vuoto = quello di base (CasaPredefinita).</summary>
    private string casaSalvata = "";

    /// <summary>La porta Google come è scritta nel file (in chiaro solo qui in memoria).</summary>
    private string googleSalvato = "";

    /// <summary>Per le prove (--server, --google): valgono per questa volta e non si scrivono.</summary>
    private string? casaDiProva;
    private string? googleDiProva;

    /// <summary>L'indirizzo del server di casa (le richieste dirette, in ufficio). Vuoto solo nelle prove con --google da solo.</summary>
    public string Server => casaDiProva ?? (casaSalvata.Length > 0 ? casaSalvata : CasaPredefinita);

    /// <summary>L'indirizzo della porta Google (lo script del foglio). Vuoto = solo casa, come prima.</summary>
    public string Google => googleDiProva ?? googleSalvato;

    public string Token { get; private set; } = "";

    /// <summary>L'ultima email con cui si è entrati: la pagina di accesso la ripropone.</summary>
    public string Email { get; private set; } = "";

    /// <summary>La ragione sociale che il server ha detto (io): la pagina di accesso la mostra sotto il titolo.</summary>
    public string Studio { get; private set; } = "";

    public bool Entrato => (Server.Length > 0 || Google.Length > 0) && Token.Length > 0;

    /// <summary>Le prove con --server o --google: gli indirizzi di adesso non sono quelli salvati.</summary>
    public bool DiProva => casaDiProva != null || googleDiProva != null;

    /// <summary>
    /// Come si presenta questo computer al server, che lo scrive negli accessi e nei
    /// dispositivi collegati. Nasce qui la prima volta e non è mai uguale su due computer.
    /// </summary>
    public string Dispositivo { get; private set; } = Guid.NewGuid().ToString();

    /// <summary>"UFFICIO-PC (manuel)": quello che si legge fra i dispositivi collegati.</summary>
    public static string NomeDispositivo { get; } = $"{Environment.MachineName} ({Environment.UserName})";

    /// <summary>Quando il file è stato letto o scritto l'ultima volta (vedi RileggiSeCambiato).</summary>
    private DateTime letto = DateTime.MinValue;

    public Configurazione(string file)
    {
        this.file = file;
        try
        {
            var (salvato, dispositivo, vecchio) = Leggi();
            if (!File.Exists(file)) return;
            // Un exe di casa porta l'indirizzo dentro, quelli pubblicati no: si salva subito,
            // così l'aggiornamento dopo non lo perde. Il nome del dispositivo deve restare lo
            // stesso da un'apertura all'altra. E un file della 0.4 si riscrive senza il codice.
            var daSalvare = salvato.Length == 0 && IndirizzoPredefinito.Length > 0;
            if (daSalvare) casaSalvata = IndirizzoPredefinito;
            if (daSalvare || dispositivo.Length == 0 || vecchio) Scrivi();
        }
        catch (Exception e) when (e is IOException or JsonException or InvalidOperationException)
        {
            Log.Errore("configurazione illeggibile", e);
        }
    }

    /// <summary>Legge il file, se c'è: torna il server e il dispositivo così come sono scritti, e se è un file vecchio.</summary>
    private (string Server, string Dispositivo, bool Vecchio) Leggi()
    {
        if (!File.Exists(file)) return ("", "", false);
        letto = File.GetLastWriteTimeUtc(file);
        var o = JsonNode.Parse(File.ReadAllText(file)) as JsonObject;
        var salvato = Testo(o?["server"]);
        casaSalvata = salvato;
        googleSalvato = IndirizzoGoogle.Pulito(Dpapi.Svela(Testo(o?["google"]))) ?? "";
        Token = Dpapi.Svela(Testo(o?["token"])) ?? "";
        Email = Testo(o?["email"]);
        Studio = Testo(o?["studio"]);
        var dispositivo = Testo(o?["dispositivo"]);
        if (dispositivo.Length > 0) Dispositivo = dispositivo;
        // La 0.4 scriveva "url" (lo script del foglio) e "codice". Lo script è la stessa porta
        // Google di adesso: l'indirizzo si tiene (cifrato); il codice non serve più.
        var vecchioUrl = IndirizzoGoogle.Pulito(Testo(o?["url"]));
        if (googleSalvato.Length == 0 && vecchioUrl != null) googleSalvato = vecchioUrl;
        var vecchio = o != null && (o.ContainsKey("codice") || o.ContainsKey("url"));
        return (salvato, dispositivo, vecchio);
    }

    private static string Testo(JsonNode? n)
    {
        try { return n?.GetValue<string>()?.Trim() ?? ""; }
        catch (InvalidOperationException) { return ""; }
    }

    /// <summary>Se il file è cambiato da fuori (un'altra copia del programma, il file .wisper) si rilegge.</summary>
    public void RileggiSeCambiato()
    {
        try
        {
            if (File.Exists(file) && File.GetLastWriteTimeUtc(file) > letto) Leggi();
        }
        catch (Exception e) when (e is IOException or JsonException or InvalidOperationException)
        {
            Log.Errore("configurazione illeggibile", e);
        }
    }

    /// <summary>
    /// Si è entrati: chiave d'accesso ed email restano per le volte dopo, e con loro gli
    /// indirizzi scritti nella pagina di accesso (null = non cambiato). Nelle prove gli
    /// indirizzi non si scrivono.
    /// </summary>
    public void SalvaAccesso(string? casa, string? google, string token, string email)
    {
        if (!DiProva) ImpostaIndirizzi(casa, google);
        Token = token.Trim();
        Email = email.Trim();
        Scrivi();
    }

    /// <summary>Il file .wisper dell'email: gli indirizzi si salvano subito (null = non cambiato). La chiave resta.</summary>
    public void SalvaIndirizzi(string? casa, string? google)
    {
        ImpostaIndirizzi(casa, google);
        Scrivi();
    }

    private void ImpostaIndirizzi(string? casa, string? google)
    {
        if (casa != null) casaSalvata = casa.Trim() == CasaPredefinita ? "" : casa.Trim();
        if (google != null) googleSalvato = google.Trim();
    }

    /// <summary>Si è usciti (o il server ha detto che la chiave non vale più): la chiave si butta, il resto resta.</summary>
    public void Esci()
    {
        if (Token.Length == 0) return;
        Token = "";
        Scrivi();
    }

    public void SalvaStudio(string studio)
    {
        studio = studio.Trim();
        if (studio.Length == 0 || studio == Studio) return;
        Studio = studio;
        Scrivi();
    }

    private void Scrivi()
    {
        Directory.CreateDirectory(Path.GetDirectoryName(file)!);
        var o = new JsonObject
        {
            ["server"] = casaSalvata,
            ["google"] = googleSalvato.Length > 0 ? Dpapi.Proteggi(googleSalvato) : "",
            ["token"] = Token.Length > 0 ? Dpapi.Proteggi(Token) : "",
            ["email"] = Email,
            ["studio"] = Studio,
            ["dispositivo"] = Dispositivo,
        };
        var tmp = file + ".tmp";
        File.WriteAllText(tmp, o.ToJsonString());
        File.Move(tmp, file, overwrite: true);
        letto = File.GetLastWriteTimeUtc(file);
    }

    /// <summary>
    /// L'indirizzo del server messo nel programma quando lo si costruisce, solo per un exe
    /// da usare in casa (crea-pacchetto.ps1 -ConIndirizzo). Quello che si pubblica su GitHub
    /// non lo ha: le release sono pubbliche.
    /// </summary>
    public static string IndirizzoPredefinito { get; } =
        typeof(Configurazione).Assembly.GetCustomAttributes(typeof(System.Reflection.AssemblyMetadataAttribute), false)
            .OfType<System.Reflection.AssemblyMetadataAttribute>()
            .FirstOrDefault(a => a.Key == "IndirizzoServer")?.Value ?? "";

    /// <summary>Il server di casa se non se ne è scritto un altro: il NAS dello studio (porta-google.md §8).</summary>
    public static string CasaPredefinita { get; } = IndirizzoPredefinito.Length > 0 ? IndirizzoPredefinito : "http://192.168.1.51:8400";

    /// <summary>
    /// Per le prove: un altro server e/o un'altra porta Google dalla riga di comando, senza
    /// toccare quelli salvati. Con uno solo dei due, l'altro per questa volta non c'è:
    /// --server da solo = il server di prova diretto, come prima; --google da solo = solo Google.
    /// </summary>
    public void IndirizziDiProva(string? server, string? google)
    {
        casaDiProva = server == null ? "" : IndirizzoServer.Pulito(server) ?? server.Trim();
        googleDiProva = google == null ? "" : IndirizzoGoogle.Pulito(google) ?? "";
        if (google != null && googleDiProva.Length == 0) Log.Errore("--google: l'indirizzo non è quello di uno script");
    }
}

/// <summary>
/// L'indirizzo della porta Google: quello dello script del foglio che finisce con /exec
/// (porta-google.md §3). Si accetta solo uno script di Google, o il finto Google delle
/// prove sul computer stesso. Non si scrive mai nel registro né nell'interfaccia.
/// </summary>
public static class IndirizzoGoogle
{
    private static readonly System.Text.RegularExpressions.Regex Script = new(
        @"^https://script\.google\.com/(macros|a/macros/[A-Za-z0-9.-]+)/s/[A-Za-z0-9_-]+/exec$", System.Text.RegularExpressions.RegexOptions.CultureInvariant);

    private static readonly System.Text.RegularExpressions.Regex Prova = new(
        @"^http://(localhost|127\.0\.0\.1)(:\d{1,5})?/exec$", System.Text.RegularExpressions.RegexOptions.CultureInvariant);

    /// <summary>"https://script.google.com/macros/s/AKfy.../exec/" -> senza la barra in fondo. Null se non va bene.</summary>
    public static string? Pulito(string? indirizzo)
    {
        var s = (indirizzo ?? "").Trim().TrimEnd('/');
        if (s.Length == 0 || s.Length > 300) return null;
        if (s.StartsWith("https://script.google.com/", StringComparison.Ordinal) && !s.EndsWith("/exec", StringComparison.Ordinal)) s += "/exec";
        return Script.IsMatch(s) || Prova.IsMatch(s) ? s : null;
    }
}

/// <summary>
/// L'indirizzo del server: https sempre; http solo sul computer stesso (le prove) o
/// nella rete di casa (192.168…, 10…, 172.16-31…, e gli indirizzi di Tailscale
/// 100.64-127…), dove la chiave non esce su internet.
/// </summary>
public static class IndirizzoServer
{
    /// <summary>"https://wisper.esempio.ts.net/exec/" -> "https://wisper.esempio.ts.net". Null se non va bene.</summary>
    public static string? Pulito(string? indirizzo)
    {
        var s = (indirizzo ?? "").Trim();
        if (s.Length == 0) return null;
        if (!s.Contains("://", StringComparison.Ordinal)) s = (Locale(s.Split('/', ':')[0]) ? "http://" : "https://") + s;
        if (!Uri.TryCreate(s, UriKind.Absolute, out var u) || u.Host.Length == 0) return null;
        if (u.Scheme == Uri.UriSchemeHttp && !Locale(u.Host)) return null;
        if (u.Scheme != Uri.UriSchemeHttp && u.Scheme != Uri.UriSchemeHttps) return null;
        if (u.Query.Length > 0 || u.Fragment.Length > 0 || u.UserInfo.Length > 0) return null;
        var percorso = u.AbsolutePath.TrimEnd('/');
        if (percorso.EndsWith("/exec", StringComparison.OrdinalIgnoreCase)) percorso = percorso[..^5];
        return u.GetLeftPart(UriPartial.Authority) + percorso;
    }

    /// <summary>Il computer stesso o la rete di casa.</summary>
    public static bool Locale(string host)
    {
        if (host is "localhost" or "127.0.0.1" or "[::1]" or "::1") return true;
        if (!System.Net.IPAddress.TryParse(host, out var ip) || ip.AddressFamily != System.Net.Sockets.AddressFamily.InterNetwork) return false;
        var b = ip.GetAddressBytes();
        return b[0] == 10 || b[0] == 127 || (b[0] == 192 && b[1] == 168) || (b[0] == 172 && b[1] >= 16 && b[1] <= 31) || (b[0] == 100 && b[1] >= 64 && b[1] <= 127);
    }
}

/// <summary>CryptProtectData dell'utente corrente, come in Pactum.</summary>
internal static class Dpapi
{
    private static readonly byte[] Entropia = Encoding.UTF8.GetBytes("WisperUfficio.token.v1");

    public static string Proteggi(string segreto) =>
        Convert.ToBase64String(Esegui(Encoding.UTF8.GetBytes(segreto), proteggi: true));

    public static string? Svela(string? protetto)
    {
        if (string.IsNullOrEmpty(protetto)) return null;
        try
        {
            return Encoding.UTF8.GetString(Esegui(Convert.FromBase64String(protetto), proteggi: false));
        }
        catch (Exception e) when (e is FormatException or Win32Exception)
        {
            return null;
        }
    }

    private static byte[] Esegui(byte[] dati, bool proteggi)
    {
        var ingresso = new DATA_BLOB();
        var entropia = new DATA_BLOB();
        var uscita = new DATA_BLOB();
        var hDati = GCHandle.Alloc(dati, GCHandleType.Pinned);
        var hEntropia = GCHandle.Alloc(Entropia, GCHandleType.Pinned);
        try
        {
            ingresso.cbData = dati.Length;
            ingresso.pbData = hDati.AddrOfPinnedObject();
            entropia.cbData = Entropia.Length;
            entropia.pbData = hEntropia.AddrOfPinnedObject();
            bool ok = proteggi
                ? CryptProtectData(ref ingresso, "Wisper", ref entropia, IntPtr.Zero, IntPtr.Zero, CRYPTPROTECT_UI_FORBIDDEN, out uscita)
                : CryptUnprotectData(ref ingresso, IntPtr.Zero, ref entropia, IntPtr.Zero, IntPtr.Zero, CRYPTPROTECT_UI_FORBIDDEN, out uscita);
            if (!ok) throw new Win32Exception(Marshal.GetLastWin32Error());
            var risultato = new byte[uscita.cbData];
            Marshal.Copy(uscita.pbData, risultato, 0, uscita.cbData);
            return risultato;
        }
        finally
        {
            hDati.Free();
            hEntropia.Free();
            if (uscita.pbData != IntPtr.Zero) LocalFree(uscita.pbData);
        }
    }

    private const int CRYPTPROTECT_UI_FORBIDDEN = 0x1;

    [StructLayout(LayoutKind.Sequential)]
    private struct DATA_BLOB
    {
        public int cbData;
        public IntPtr pbData;
    }

    [DllImport("crypt32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool CryptProtectData(ref DATA_BLOB dataIn, string description, ref DATA_BLOB entropy,
        IntPtr reserved, IntPtr prompt, int flags, out DATA_BLOB dataOut);

    [DllImport("crypt32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool CryptUnprotectData(ref DATA_BLOB dataIn, IntPtr description, ref DATA_BLOB entropy,
        IntPtr reserved, IntPtr prompt, int flags, out DATA_BLOB dataOut);

    [DllImport("kernel32.dll")]
    private static extern IntPtr LocalFree(IntPtr mem);
}

/// <summary>Un registro di testo accanto ai dati: quello che serve per capire un problema a posteriori.</summary>
public static class Log
{
    public static string? File { get; set; }

    public static void Info(string testo) => Scrivi("INFO", testo);

    public static void Errore(string testo, Exception? e = null) =>
        Scrivi("ERRORE", e == null ? testo : $"{testo}: {e.GetType().Name}: {e.Message}");

    private static readonly object Lucchetto = new();

    private static void Scrivi(string livello, string testo)
    {
        if (File == null) return;
        try
        {
            lock (Lucchetto)
            {
                var info = new FileInfo(File);
                // Un registro che cresce per sempre non serve a nessuno: oltre 2 MB si ricomincia.
                if (info.Exists && info.Length > 2_000_000) info.Delete();
                System.IO.File.AppendAllText(File, $"{DateTime.Now:yyyy-MM-dd HH:mm:ss} {livello} {testo}{Environment.NewLine}");
            }
        }
        catch (IOException)
        {
        }
    }
}
