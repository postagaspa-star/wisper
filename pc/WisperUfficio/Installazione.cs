using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Text;
using Microsoft.Win32;

namespace WisperUfficio;

/// <summary>
/// La prima volta che si apre il file scaricato, Wisper Ufficio si installa da
/// solo, per l'utente e senza amministratore:
///   - si copia in %LOCALAPPDATA%\Programs\WisperUfficio (fuori da OneDrive, che
///     bloccando i file farebbe fallire gli aggiornamenti);
///   - mette l'icona in Start e sul Desktop, così si trova scrivendo "Wisper";
///   - compare in Impostazioni › App installate, da dove si toglie (--disinstalla).
/// Poi riapre la copia installata. Le volte dopo parte già da lì e non fa niente.
/// </summary>
public static class Installazione
{
    public const string Nome = "Wisper Ufficio";
    private const string ChiaveDisinstalla = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\WisperUfficio";

    /// <summary>Dove vanno programma e icone. Per le prove tutto sotto una cartella, e niente registro.</summary>
    public sealed record Luoghi(string Cartella, string MenuStart, string Desktop, bool Registro)
    {
        public string Exe => Path.Combine(Cartella, "WisperUfficio.exe");

        public static Luoghi Normali() => new(
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "WisperUfficio"),
            Environment.GetFolderPath(Environment.SpecialFolder.Programs),
            Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),
            Registro: true);

        public static Luoghi DiProva(string radice) => new(
            Path.Combine(radice, "Programs", "WisperUfficio"), Path.Combine(radice, "Start"), Path.Combine(radice, "Desktop"), Registro: false);
    }

    /// <summary>
    /// Se questo exe non è quello installato, lo installa (o aggiorna quello installato
    /// se questo è più nuovo) e riapre la copia installata. Vero = questo processo
    /// deve chiudersi, ci pensa la copia installata.
    /// </summary>
    public static bool InstallaSeServe(string exe, Luoghi luoghi, IReadOnlyList<string> argomenti)
    {
        if (string.Equals(Path.GetFullPath(exe), Path.GetFullPath(luoghi.Exe), StringComparison.OrdinalIgnoreCase))
        {
            // Già installato: si tengono a posto l'icona in Start e la voce fra le app.
            try
            {
                var start = Path.Combine(luoghi.MenuStart, Nome + ".lnk");
                if (!File.Exists(start)) CreaCollegamento(start, luoghi.Exe);
                if (luoghi.Registro) Registra(luoghi);
            }
            catch (Exception e) { Log.Errore("collegamenti non controllati", e); }
            return false;
        }

        var mia = VersioneDi(exe);
        var installata = File.Exists(luoghi.Exe) ? VersioneDi(luoghi.Exe) : null;
        var nuova = installata == null;
        try
        {
            if (installata == null || (mia != null && mia > installata))
            {
                Directory.CreateDirectory(luoghi.Cartella);
                File.Copy(exe, luoghi.Exe, overwrite: true);
            }
            if (nuova)
            {
                CreaCollegamento(Path.Combine(luoghi.MenuStart, Nome + ".lnk"), luoghi.Exe);
                CreaCollegamento(Path.Combine(luoghi.Desktop, Nome + ".lnk"), luoghi.Exe);
            }
            if (luoghi.Registro) Registra(luoghi);
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            // Per esempio la copia installata è aperta: si usa quella che c'è.
            Log.Errore("installazione non completata", e);
            if (installata == null) return false;
        }

        var avvio = new ProcessStartInfo(luoghi.Exe) { UseShellExecute = false, WorkingDirectory = luoghi.Cartella };
        foreach (var a in argomenti) avvio.ArgumentList.Add(a);
        if (nuova) avvio.ArgumentList.Add("--appena-installato");
        Process.Start(avvio)?.Dispose();
        Log.Info((nuova ? "installato in " : "aperta la copia installata in ") + luoghi.Cartella);
        return true;
    }

    private static Version? VersioneDi(string file)
    {
        var v = FileVersionInfo.GetVersionInfo(file);
        return v.FileMajorPart + v.FileMinorPart + v.FileBuildPart > 0 ? new Version(v.FileMajorPart, v.FileMinorPart, v.FileBuildPart) : null;
    }

    /// <summary>La voce in Impostazioni › App installate (solo per questo utente).</summary>
    private static void Registra(Luoghi luoghi)
    {
        using var k = Registry.CurrentUser.CreateSubKey(ChiaveDisinstalla);
        k.SetValue("DisplayName", Nome);
        k.SetValue("DisplayVersion", typeof(Installazione).Assembly.GetName().Version?.ToString(3) ?? "");
        k.SetValue("Publisher", "Studio Tecnico GM");
        k.SetValue("DisplayIcon", luoghi.Exe);
        k.SetValue("InstallLocation", luoghi.Cartella);
        k.SetValue("UninstallString", $"\"{luoghi.Exe}\" --disinstalla");
        k.SetValue("NoModify", 1, RegistryValueKind.DWord);
        k.SetValue("NoRepair", 1, RegistryValueKind.DWord);
        var dimensione = new FileInfo(luoghi.Exe).Length / 1024;
        k.SetValue("EstimatedSize", (int)Math.Min(int.MaxValue, dimensione), RegistryValueKind.DWord);
    }

    /// <summary>
    /// Da Impostazioni › App installate: via le icone, la voce e il programma. I dati
    /// (collegamento al foglio, copie delle foto) e i PDF in Documenti\Wisper restano.
    /// </summary>
    public static void Disinstalla(Luoghi luoghi)
    {
        foreach (var lnk in new[] { Path.Combine(luoghi.MenuStart, Nome + ".lnk"), Path.Combine(luoghi.Desktop, Nome + ".lnk") })
        {
            try { if (File.Exists(lnk)) File.Delete(lnk); } catch (IOException) { }
        }
        if (luoghi.Registro) Registry.CurrentUser.DeleteSubKeyTree(ChiaveDisinstalla, throwOnMissingSubKey: false);
        // L'exe in uso non si può cancellare: lo fa PowerShell appena questo programma si è chiuso
        // (dopo che si è letto il messaggio "è stato tolto").
        if (Directory.Exists(luoghi.Cartella))
        {
            var cartella = luoghi.Cartella.Replace("'", "''");
            var comando = $"Wait-Process -Id {Environment.ProcessId} -ErrorAction SilentlyContinue; Start-Sleep -Seconds 1; " +
                          $"Remove-Item -LiteralPath '{cartella}' -Recurse -Force";
            var avvio = new ProcessStartInfo("powershell.exe") { CreateNoWindow = true, UseShellExecute = false };
            foreach (var a in new[] { "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", comando }) avvio.ArgumentList.Add(a);
            Process.Start(avvio)?.Dispose();
        }
        Log.Info("disinstallato");
    }

    // ---------------------------------------------------------------- collegamenti .lnk

    private static void CreaCollegamento(string percorso, string exe)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(percorso)!);
        var link = (IShellLinkW)new ShellLink();
        link.SetPath(exe);
        link.SetWorkingDirectory(Path.GetDirectoryName(exe)!);
        link.SetDescription("Rapportini, commesse e fine mese");
        link.SetIconLocation(exe, 0);
        ((IPersistFile)link).Save(percorso, true);
        Marshal.FinalReleaseComObject(link);
    }

    [ComImport, Guid("00021401-0000-0000-C000-000000000046")]
    private class ShellLink { }

    [ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("000214F9-0000-0000-C000-000000000046")]
    private interface IShellLinkW
    {
        void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszFile, int cchMaxPath, IntPtr pfd, uint fFlags);
        void GetIDList(out IntPtr ppidl);
        void SetIDList(IntPtr pidl);
        void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszName, int cchMaxName);
        void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string pszName);
        void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszDir, int cchMaxPath);
        void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string pszDir);
        void GetArguments([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszArgs, int cchMaxPath);
        void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string pszArgs);
        void GetHotkey(out short pwHotkey);
        void SetHotkey(short wHotkey);
        void GetShowCmd(out int piShowCmd);
        void SetShowCmd(int iShowCmd);
        void GetIconLocation([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszIconPath, int cchIconPath, out int piIcon);
        void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string pszIconPath, int iIcon);
        void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string pszPathRel, uint dwReserved);
        void Resolve(IntPtr hwnd, uint fFlags);
        void SetPath([MarshalAs(UnmanagedType.LPWStr)] string pszFile);
    }
}
