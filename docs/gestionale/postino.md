# Il postino e il ponte (lo script del foglio dopo il cambio)

Completa la §9 di [`architettura.md`](architettura.md). Il codice è in `apps-script/Ponte.gs`, agganciato a
`Code.gs` in due punti (`doPost` per il postino, `rispondi` per il ponte).

## Proprietà dello script

| Proprietà | Cosa | Chi la mette |
|---|---|---|
| `CODICE` | il codice di oggi: serve ancora alle versioni vecchie delle app (ponte) | c'è già |
| `SERVER_URL` | l'indirizzo pubblico del server sul NAS, per esempio `https://wisper.<tailnet>.ts.net` | Andrea, il giorno del cambio |
| `SEGRETO_SERVER` | lo stesso valore di `SEGRETO_SERVER` nel `.env` del NAS (anche `WISPER_POSTINO_SEGRETO`) | Andrea, il giorno del cambio |

Senza `SERVER_URL` lo script lavora come oggi sul foglio (il ponte è spento); il postino risponde lo stesso, se ha il
segreto, tranne `postinoFoglio` (che riscrive le schede solo a ponte acceso, per non toccare mai il foglio vivo).

## Il ponte

Con `SERVER_URL` impostato, ogni richiesta col CODICE giusto (versioni vecchie di telefono e computer) viene inoltrata
così com'è, **senza il campo `codice`**, a `POST <SERVER_URL>/ponte` con l'intestazione `X-Wisper-Segreto`; la risposta
del server torna al chiamante. Se il server non risponde o risponde con un errore HTTP, lo script **lancia un errore**:
Google risponde con una pagina d'errore, che le app trattano come "rete" e quindi riprovano (un rapportino in coda non
viene scartato). Ogni richiesta inoltrata lascia una riga in Accessi con esito `ponte`.

## Il postino

`POST <url dello script>` con corpo JSON; tutte col campo `segreto` = `SEGRETO_SERVER` (mai col CODICE). Risposta
`{"ok": true, ...}` o `{"ok": false, "errore": "..."}`. Il segreto sbagliato risponde `{"ok":false,"errore":"Segreto
sbagliato"}`.

| Azione | Corpo | Risposta |
|---|---|---|
| `postinoEmail` | `a` (uno o più indirizzi separati da virgola), `cc?`, `rispondiA?`, `nome?` (il mittente che si legge, di base la ragione sociale), `oggetto`, `messaggio` (testo), `allegati?` `[{nome, mime, base64}]`, `alProprietario?` (true: invece di `a` va al proprietario del foglio e a `EMAIL_AVVISI`, per gli avvisi) | `{ok, rimaste}` (email che Google lascia ancora mandare oggi) |
| `postinoCopia` | `cartella` (`database` o `file`), `nome`, `mime`, `base64` | `{ok, id}`. Salva in Drive `Wisper/Copie NAS/<cartella>/<nome>`; un file con lo stesso nome va nel cestino di Drive e lo sostituisce. Massimo 20 MB per chiamata (oltre: il server divide in pezzi `<nome>.parte1`, `.parte2`…). Segna l'ora dell'ultima copia riuscita per cartella. |
| `postinoFoglio` | `scheda` (`Rapportini`, `Clienti`, `Commesse`, `Impostazioni`), `intestazioni` `[..]`, `righe` `[[..]]` | `{ok, righe}`. Sostituisce il contenuto della scheda (intestazioni comprese), scrivendo partite IVA, telefoni e codici come testo. Solo a ponte acceso. |
| `postinoProva` | — | `{ok, quando, rimaste}` |
| `postinoImpronta` | `cartella`, `nome` (come `postinoCopia`) | `{ok, byte, md5}` della copia su Drive (non quella nel cestino), con `Utilities.computeDigest`. Solo lettura. Fase 8: la prova automatica delle copie (fase8.md §9.10). |
| `postinoLeggi` | `richiesta: {azione: rapportini | file | documenti | anagrafiche, ...}` | La stessa risposta di `doGet`, col segreto al posto del codice delle app. Solo letture. 02/11/2026: `copia-drive.js --postino` la sera del cambio. |
| `postinoEsporta` | — | `{ok, nome, byte, base64}`: il foglio intero in Excel, lo stesso file di File › Scarica › Microsoft Excel (export di Google con la chiave del proprietario). 02/11/2026: `scarica-foglio.js` per `importa.js`. |
| `postinoPonte` | `acceso: true | false` | Scrive `PONTE_PORTA` = `si` / `no` e torna `{ok, ponte}`. 02/11/2026: `strumenti/ponte.js si` la sera del cambio, `no` per tornare indietro. |

## I controlli del mattino

`installaControlli()` (da eseguire una volta dall'editor, chiede il permesso per gli attivatori) crea un attivatore
ogni giorno alle 7: `controlloMattina()` chiama `<SERVER_URL>/salute` e, se il server non risponde o se l'ultima copia
del database su Drive ha più di 50 ore, manda un'email al proprietario e a `EMAIL_AVVISI` (al massimo una ogni 12 ore
per motivo).
