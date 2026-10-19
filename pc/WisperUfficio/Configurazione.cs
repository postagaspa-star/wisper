using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace WisperUfficio;

/// <summary>
/// Dove sta il foglio e il codice per entrarci. Il codice sul disco è cifrato con
/// DPAPI dell'utente di Windows: lo può leggere solo questo utente su questo computer.
/// L'interfaccia non lo vede mai (solo le ultime quattro cifre): lo aggiunge il ponte a ogni chiamata.
/// </summary>
public sealed class Configurazione
{
    private readonly string file;

    public string Url { get; private set; } = IndirizzoPredefinito;
    public string Codice { get; private set; } = "";
    public bool Configurato => Url.Length > 0 && Codice.Length > 0;

    /// <summary>
    /// Come si presenta questo computer al foglio, che lo scrive nella scheda Accessi a
    /// ogni richiesta. Nasce qui la prima volta e non è mai uguale su due computer.
    /// </summary>
    public string Dispositivo { get; private set; } = Guid.NewGuid().ToString();

    /// <summary>"UFFICIO-PC (manuel)": quello che si legge nella scheda Accessi.</summary>
    public static string NomeDispositivo { get; } = $"{Environment.MachineName} ({Environment.UserName})";

    public Configurazione(string file)
    {
        this.file = file;
        try
        {
            if (!File.Exists(file)) return;
            var o = JsonNode.Parse(File.ReadAllText(file)) as JsonObject;
            var salvato = o?["url"]?.GetValue<string>() ?? "";
            if (salvato.Length > 0) Url = salvato;
            Codice = Dpapi.Svela(o?["codice"]?.GetValue<string>()) ?? "";
            var dispositivo = o?["dispositivo"]?.GetValue<string>() ?? "";
            if (dispositivo.Length > 0) Dispositivo = dispositivo;
            // Un exe di casa porta l'indirizzo dentro, quelli pubblicati no: si salva subito,
            // così l'aggiornamento dopo non scollega il computer. E il nome del dispositivo
            // deve restare lo stesso da un'apertura all'altra.
            if ((salvato.Length == 0 && Url.Length > 0) || dispositivo.Length == 0) Scrivi();
        }
        catch (Exception e) when (e is IOException or JsonException or InvalidOperationException)
        {
            Log.Errore("configurazione illeggibile", e);
        }
    }

    public void Salva(string url, string codice)
    {
        Url = url.Trim();
        Codice = codice.Trim();
        Scrivi();
    }

    private void Scrivi()
    {
        Directory.CreateDirectory(Path.GetDirectoryName(file)!);
        var o = new JsonObject { ["url"] = Url, ["codice"] = Dpapi.Proteggi(Codice), ["dispositivo"] = Dispositivo };
        var tmp = file + ".tmp";
        File.WriteAllText(tmp, o.ToJsonString());
        File.Move(tmp, file, overwrite: true);
    }

    /// <summary>
    /// L'indirizzo del foglio messo nel programma quando lo si costruisce, solo per un exe
    /// da usare in casa (crea-pacchetto.ps1 -ConIndirizzo). Quello che si pubblica su GitHub
    /// non lo ha: le release sono pubbliche. Senza, è vuoto e lo si scrive in Impostazioni.
    /// </summary>
    public static string IndirizzoPredefinito { get; } =
        typeof(Configurazione).Assembly.GetCustomAttributes(typeof(System.Reflection.AssemblyMetadataAttribute), false)
            .OfType<System.Reflection.AssemblyMetadataAttribute>()
            .FirstOrDefault(a => a.Key == "IndirizzoFoglio")?.Value ?? "";

    /// <summary>Per le prove: indirizzo e codice dalla riga di comando, senza toccare il disco.</summary>
    public void Imposta(string url, string codice)
    {
        Url = url.Trim();
        Codice = codice.Trim();
    }
}

/// <summary>CryptProtectData dell'utente corrente, come in Pactum.</summary>
internal static class Dpapi
{
    private static readonly byte[] Entropia = Encoding.UTF8.GetBytes("WisperUfficio.codice.v1");

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
