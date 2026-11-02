using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace WisperUfficio;

/// <summary>
/// Entrare col telefono, come WhatsApp (docs/gestionale/collega-qr.md §5 e §6). La pagina di accesso mostra un QR
/// con un id a caso e la chiave pubblica di questo computer; il telefono (già entrato) lo inquadra e lo autorizza;
/// il computer chiede al server di casa attesaComputer finché il server non gli dà il pacchetto (la stessa risposta
/// di accedi, più l'indirizzo Google) cifrato per lui. Lo decifra, salva chiave d'accesso e indirizzo come fa accedi
/// (cifrati con DPAPI, Configurazione.cs) ed entra, senza email né password.
///
/// Le chiavi stanno solo in memoria e sono al massimo due: quella del QR di adesso e la precedente, per 20 secondi
/// (il telefono potrebbe aver letto quella vecchia proprio mentre il codice cambiava). La parte privata non esce mai
/// da qui: chi ha visto o fotografato il QR non può leggere il pacchetto.
///
/// La cifratura è la stessa del server (server/src/azioni/collega.js): ECDH P-256, HKDF-SHA256 (sale = id, info =
/// "wisper-collega-1"), AES-256-GCM con AAD = id. Il caso fisso di server/prove/casi-collega.json si prova con
/// <c>WisperUfficio.exe --prova-collega &lt;casi&gt; &lt;uscita&gt;</c> (pc/prove/collega-exe.test.js).
/// </summary>
public sealed class CollegaQr
{
    /// <summary>L'inizio del testo del QR: il "1" è la versione del protocollo (§3).</summary>
    public const string Prefisso = "wisper-collega:1:";

    private static readonly byte[] Info = Encoding.UTF8.GetBytes("wisper-collega-1");

    /// <summary>Quanto resta viva la chiave di prima dopo che la pagina ne ha chiesta una nuova.</summary>
    private static readonly TimeSpan VitaPrecedente = TimeSpan.FromSeconds(20);

    /// <summary>
    /// Quanto vive una chiave in tutto: i 2 minuti del codice più i 20 secondi della precedente. Se la pagina non ne
    /// chiede più (dopo 5 codici si ferma), l'ultima sparisce da sola.
    /// </summary>
    private static readonly TimeSpan VitaMassima = TimeSpan.FromMinutes(2) + VitaPrecedente;

    /// <summary>Il nome nel QR: al massimo 32 caratteri e, scritto per il QR, al massimo 128 byte (versione 10 al massimo).</summary>
    private const int NomeMassimo = 32;
    private const int NomeMassimoScritto = 128;

    private sealed class Chiave(string id, byte[] idByte, ECDiffieHellman ecdh)
    {
        public string Id { get; } = id;
        public byte[] IdByte { get; } = idByte;
        public ECDiffieHellman Ecdh { get; } = ecdh;
        public DateTime Creata { get; } = DateTime.UtcNow;
        public DateTime? Sostituita { get; set; }
    }

    private readonly Configurazione config;
    private readonly Server server;
    private readonly object lucchetto = new();
    private readonly List<Chiave> vive = new();

    public CollegaQr(Configurazione config, Server server)
    {
        this.config = config;
        this.server = server;
    }

    /// <summary>POST /locale/collega-qr: una coppia di chiavi nuova e un id nuovo; torna il testo da mettere nel QR.</summary>
    public string Nuovo()
    {
        var ecdh = ECDiffieHellman.Create(ECCurve.NamedCurves.nistP256);
        var id = RandomNumberGenerator.GetBytes(16);
        var chiave = new Chiave(B64(id), id, ecdh);
        lock (lucchetto)
        {
            Pulisci();
            var ora = DateTime.UtcNow;
            foreach (var c in vive) c.Sostituita ??= ora;
            // Al massimo due vive: la nuova e quella di prima (le altre, se ce ne fossero, via subito).
            while (vive.Count > 1) Togli(vive[0]);
            vive.Add(chiave);
        }
        return Testo(chiave.Id, B64(Compressa(ecdh)), Environment.MachineName);
    }

    /// <summary>
    /// GET /locale/collega-qr-stato: chiede attesaComputer al server di casa per le chiavi vive. "attesa", "lontano"
    /// (il server di casa non ha risposto in 1,5 secondi: il computer non è in ufficio), "rifiutato" (chi ha inquadrato
    /// non può più entrare) o "entrato" col nome e i permessi: in quel caso la chiave d'accesso è già salvata.
    /// </summary>
    public async Task<JsonObject> StatoAsync()
    {
        List<Chiave> daChiedere;
        lock (lucchetto)
        {
            Pulisci();
            daChiedere = vive.ToList();
        }
        if (daChiedere.Count == 0) return Stato("attesa");
        var risposte = 0;
        foreach (var c in daChiedere)
        {
            var r = await server.AttesaComputerAsync(c.Id).ConfigureAwait(false);
            if (r == null) continue;
            risposte++;
            var stato = Testo(r["stato"]);
            if (stato == "rifiutato")
            {
                lock (lucchetto) Togli(c);
                Log.Info("collegamento col QR rifiutato dal server");
                return Stato("rifiutato");
            }
            if (stato != "pronto") continue;
            JsonObject? pacchetto;
            try
            {
                pacchetto = JsonNode.Parse(Decifra(c.Ecdh, c.IdByte, Testo(r["chiave"]), Testo(r["iv"]), Testo(r["dati"]))) as JsonObject;
            }
            catch (Exception e) when (e is CryptographicException or FormatException or JsonException or ArgumentException)
            {
                // Un pacchetto che non si apre non è per questa chiave (o è rovinato): si continua ad aspettare.
                Log.Errore("pacchetto del collegamento col QR non decifrato", e);
                continue;
            }
            var entrato = Salva(pacchetto);
            if (entrato != null) return entrato;
        }
        // Se il server di casa non ha risposto a nessuna domanda, il computer non è in ufficio.
        return Stato(risposte == 0 ? "lontano" : "attesa");
    }

    /// <summary>Il pacchetto decifrato: chiave d'accesso e indirizzo Google si salvano come fa accedi (Ponte.AccediAsync).</summary>
    private JsonObject? Salva(JsonObject? p)
    {
        var token = Testo(p?["token"]);
        if (p == null || p["ok"]?.GetValueKind() != JsonValueKind.True || token.Length == 0)
        {
            Log.Errore("pacchetto del collegamento col QR senza chiave d'accesso");
            return null;
        }
        // L'indirizzo Google c'è solo se il server ha la porta accesa; uno che non va bene non si salva (resta quello di prima).
        string? google = null;
        var scritto = Testo(p["google"]);
        if (scritto.Length > 0)
        {
            google = IndirizzoGoogle.Pulito(scritto);
            if (google == null) Log.Errore("collegamento col QR: l'indirizzo Google del server non va bene, non lo salvo");
        }
        config.SalvaAccesso(null, google, token, Testo(p["utente"]?["email"]));
        server.Dimentica();
        lock (lucchetto)
        {
            foreach (var c in vive.ToList()) Togli(c);
        }
        Log.Info("entrato col QR come " + (p["utente"]?["ruolo"]?.ToString() ?? "?"));
        return new JsonObject
        {
            ["ok"] = true,
            ["stato"] = "entrato",
            ["utente"] = p["utente"]?.DeepClone(),
            ["permessi"] = p["permessi"]?.DeepClone(),
        };
    }

    /// <summary>Dentro il lucchetto: via le chiavi scadute (la precedente dopo 20 secondi, tutte dopo 2 minuti e 20).</summary>
    private void Pulisci()
    {
        var ora = DateTime.UtcNow;
        foreach (var c in vive.Where(c => ora - c.Creata > VitaMassima || (c.Sostituita is DateTime s && ora - s > VitaPrecedente)).ToList()) Togli(c);
    }

    private void Togli(Chiave c)
    {
        vive.Remove(c);
        c.Ecdh.Dispose();
    }

    private static JsonObject Stato(string stato) => new() { ["ok"] = true, ["stato"] = stato };

    // ------------------------------------------------------------------ il testo del QR (§3)

    /// <summary>"wisper-collega:1:&lt;id&gt;:&lt;chiave&gt;:&lt;nome&gt;", come TestoQr in pc/ui/regole-collegamento.js.</summary>
    public static string Testo(string id, string chiave, string nome) => Prefisso + id + ":" + chiave + ":" + Scritto(NomeQr(nome));

    /// <summary>
    /// Il nome del computer per il QR: senza caratteri di controllo, al massimo 32 caratteri e, scritto, al massimo
    /// 128 byte (così il QR sta nella versione 10). Vuoto: "Computer".
    /// </summary>
    public static string NomeQr(string nome)
    {
        // I caratteri come li conta il server (code point: uno fuori dal piano base vale uno, non due).
        var pezzi = (nome ?? "").EnumerateRunes()
            .Where(r => Rune.GetUnicodeCategory(r) is not (System.Globalization.UnicodeCategory.Control or System.Globalization.UnicodeCategory.Format))
            .Select(r => r.ToString())
            .ToList();
        var pulito = string.Concat(pezzi).Trim();
        if (pulito.Length == 0) return "Computer";
        pezzi = pulito.EnumerateRunes().Select(r => r.ToString()).ToList();
        var n = Math.Min(NomeMassimo, pezzi.Count);
        // Si toglie in fondo finché il nome, scritto per il QR, sta nei byte.
        while (n > 1 && Scritto(string.Concat(pezzi.Take(n))).Length > NomeMassimoScritto) n--;
        return string.Concat(pezzi.Take(n)).TrimEnd();
    }

    /// <summary>Come encodeURIComponent di JavaScript: lascia A-Z a-z 0-9 - _ . ! ~ * ' ( ), il resto in %XX dell'UTF-8.</summary>
    public static string Scritto(string s)
    {
        var b = new StringBuilder();
        foreach (var x in Encoding.UTF8.GetBytes(s))
        {
            var c = (char)x;
            if (x < 128 && (char.IsAsciiLetterOrDigit(c) || "-_.!~*'()".Contains(c))) b.Append(c);
            else b.Append('%').Append(x.ToString("X2", System.Globalization.CultureInfo.InvariantCulture));
        }
        return b.ToString();
    }

    // ------------------------------------------------------------------ la cifratura (§5)

    /// <summary>La chiave pubblica compressa: 02 (Y pari) o 03 (Y dispari), poi la X. 33 byte.</summary>
    public static byte[] Compressa(ECDiffieHellman ecdh)
    {
        var q = ecdh.ExportParameters(false).Q;
        var fuori = new byte[33];
        fuori[0] = (byte)((q.Y![31] & 1) == 0 ? 0x02 : 0x03);
        q.X!.CopyTo(fuori, 1);
        return fuori;
    }

    /// <summary>
    /// Il pacchetto in chiaro: segreto = ECDH(privata del computer, pubblica del server, non compressa, 65 byte),
    /// chiave AES = HKDF-SHA256(segreto, sale = id, info = "wisper-collega-1", 32 byte), AES-256-GCM con AAD = id e il
    /// tag di 16 byte in coda. Lancia CryptographicException se non torna.
    /// </summary>
    public static string Decifra(ECDiffieHellman computer, byte[] id, string chiaveServer, string iv, string dati)
    {
        var pubblica = DaB64(chiaveServer);
        if (pubblica.Length != 65 || pubblica[0] != 0x04) throw new CryptographicException("chiave del server non valida");
        using var server = ECDiffieHellman.Create(new ECParameters
        {
            Curve = ECCurve.NamedCurves.nistP256,
            Q = new ECPoint { X = pubblica[1..33], Y = pubblica[33..] },
        });
        var segreto = computer.DeriveRawSecretAgreement(server.PublicKey);
        var chiave = HKDF.DeriveKey(HashAlgorithmName.SHA256, segreto, 32, id, Info);
        var nonce = DaB64(iv);
        var tutto = DaB64(dati);
        if (nonce.Length != 12 || tutto.Length < 16) throw new CryptographicException("pacchetto troppo corto");
        var chiaro = new byte[tutto.Length - 16];
        using (var aes = new AesGcm(chiave, 16))
        {
            aes.Decrypt(nonce, tutto.AsSpan(0, tutto.Length - 16), tutto.AsSpan(tutto.Length - 16), chiaro, id);
        }
        CryptographicOperations.ZeroMemory(segreto);
        CryptographicOperations.ZeroMemory(chiave);
        return Encoding.UTF8.GetString(chiaro);
    }

    public static string B64(byte[] b) => Convert.ToBase64String(b).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    public static byte[] DaB64(string s)
    {
        var t = (s ?? "").Replace('-', '+').Replace('_', '/');
        return Convert.FromBase64String(t + new string('=', (4 - t.Length % 4) % 4));
    }

    private static string Testo(JsonNode? n)
    {
        try { return n?.GetValueKind() == JsonValueKind.String ? n.GetValue<string>() : ""; }
        catch (InvalidOperationException) { return ""; }
    }

    // ------------------------------------------------------------------ le prove senza finestra

    /// <summary>
    /// --prova-collega-vivo TESTO ESITO (con --dati e --server): il giro vero contro un server di prova, senza finestra.
    /// Scrive il testo del QR in TESTO (lo legge la prova, che fa la parte del telefono), chiede lo stato ogni mezzo
    /// secondo per 30 secondi al massimo, e alla fine scrive in ESITO lo stato e, se è entrato, chi è per il server
    /// (io con la chiave appena salvata). Torna 0 se è entrato.
    /// </summary>
    public static int ProvaDalVivo(Configurazione config, Server server, string fileTesto, string uscita)
    {
        var qr = new CollegaQr(config, server);
        File.WriteAllText(fileTesto + ".tmp", qr.Nuovo());
        File.Move(fileTesto + ".tmp", fileTesto, overwrite: true);
        var stato = Stato("attesa");
        var fine = DateTime.UtcNow + TimeSpan.FromSeconds(30);
        while (DateTime.UtcNow < fine)
        {
            stato = qr.StatoAsync().GetAwaiter().GetResult();
            if (Testo(stato["stato"]) is "entrato" or "rifiutato" or "lontano") break;
            Thread.Sleep(500);
        }
        var esito = new JsonObject { ["stato"] = Testo(stato["stato"]), ["utente"] = stato["utente"]?.DeepClone(), ["entrato"] = config.Entrato };
        if (config.Entrato)
        {
            var (_, json) = server.LeggiAsync("io", Array.Empty<KeyValuePair<string, string>>()).GetAwaiter().GetResult();
            esito["io"] = (JsonNode.Parse(json) as JsonObject)?["utente"]?.DeepClone();
        }
        File.WriteAllText(uscita, esito.ToJsonString());
        return Testo(stato["stato"]) == "entrato" ? 0 : 1;
    }

    /// <summary>
    /// --prova-collega CASI USCITA: per ogni caso di server/prove/casi-collega.json ricava la chiave compressa dalla
    /// privata (deve essere quella del QR), decifra il risultato del server e lo confronta col testo in chiaro; prova
    /// anche che un byte cambiato non passa. Scrive l'esito in USCITA (JSON) e torna 0 se tutto torna, 1 se no.
    /// Non apre finestre, non legge né scrive la configurazione.
    /// </summary>
    public static int ProvaCasi(string casi, string uscita)
    {
        var esiti = new JsonArray();
        var tutti = true;
        try
        {
            var elenco = (JsonNode.Parse(File.ReadAllText(casi)) as JsonObject)?["casi"] as JsonArray ?? new JsonArray();
            foreach (var n in elenco)
            {
                var c = (JsonObject)n!;
                var nome = Testo(c["nome"]);
                string errore = "";
                try
                {
                    var pubblica = DaB64(Testo(c["pubblicaComputer"]));
                    using var ecdh = ECDiffieHellman.Create(new ECParameters
                    {
                        Curve = ECCurve.NamedCurves.nistP256,
                        D = DaB64(Testo(c["privataComputer"])),
                        Q = new ECPoint { X = pubblica[1..33], Y = pubblica[33..] },
                    });
                    var r = (JsonObject)c["risultato"]!;
                    var id = DaB64(Testo(c["id"]));
                    if (B64(Compressa(ecdh)) != Testo(c["chiaveQr"])) errore = "la chiave compressa non è quella del QR";
                    else if (Decifra(ecdh, id, Testo(r["chiave"]), Testo(r["iv"]), Testo(r["dati"])) != Testo(c["inChiaro"])) errore = "il testo decifrato non è quello atteso";
                    else
                    {
                        var rotto = DaB64(Testo(r["dati"]));
                        rotto[3] ^= 1;
                        try
                        {
                            Decifra(ecdh, id, Testo(r["chiave"]), Testo(r["iv"]), B64(rotto));
                            errore = "un pacchetto rovinato è passato";
                        }
                        catch (CryptographicException) { /* giusto così */ }
                    }
                }
                catch (Exception e) when (e is CryptographicException or FormatException or InvalidCastException or ArgumentException)
                {
                    errore = e.GetType().Name + ": " + e.Message;
                }
                if (errore.Length > 0) tutti = false;
                esiti.Add(new JsonObject { ["nome"] = nome, ["ok"] = errore.Length == 0, ["errore"] = errore });
            }
            if (elenco.Count == 0) tutti = false;
        }
        catch (Exception e) when (e is IOException or JsonException or UnauthorizedAccessException)
        {
            tutti = false;
            esiti.Add(new JsonObject { ["nome"] = "lettura", ["ok"] = false, ["errore"] = e.Message });
        }
        // Il testo del QR come lo fa il programma, per confrontarlo con quello delle regole della pagina.
        var esempio = Testo("AAAAAAAAAAAAAAAAAAAAAA", "A51pUoMUCK9srHCmm9ih3tT6Q5ygBc8YetQmqaWOpAWl", "PC di Laura · Città (1)");
        var lunghi = NomeQr(new string('€', 40));
        File.WriteAllText(uscita, new JsonObject
        {
            ["ok"] = tutti,
            ["casi"] = esiti,
            ["testoEsempio"] = esempio,
            ["nomeLungo"] = lunghi,
        }.ToJsonString());
        return tutti ? 0 : 1;
    }
}
