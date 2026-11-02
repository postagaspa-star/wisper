# Collegare il computer col QR (02/11/2026)

Idea di Andrea (02/11/2026): "quando scarichi l'app da pc ti appare un QR code, e da telefono al posto di inserire la mail
a cui inviare un codice o roba simile appare una telecamera dove devi inquadrare il codice qr del pc, un po' come fa
WhatsApp per collegare più dispositivi". Prototipo: `docs/prototipo/Collega-QR.html` (computer e telefono insieme, chiaro
e scuro, casi difficili). Vale sul ramo `gestionale` (server 0.11.x): nella 0.4.0 il computer non sa dove sta il foglio
finché qualcuno non glielo dice, e il QR va dal computer al telefono, non al contrario.

Oggi, sul gestionale, un computer nuovo deve scrivere a mano l'indirizzo dello script Google (lungo e segreto) e poi email
e password; l'email col file `.wisper` non esiste più (`collegaComputer` sul server "non serve più"). Il QR risolve tutte e
due le cose: il computer riceve **la chiave d'accesso e l'indirizzo Google** in un colpo, cifrati per lui.

## 1. Principi (dalla ricerca)

1. **Come WhatsApp** (legge di Jakob): il codice sta sul computer, appena si apre la pagina di accesso; accanto tre passi
   numerati coi nomi veri del menu; sul telefono una voce del menu apre direttamente la fotocamera.
2. **Il telefono chiede conferma** mostrando il nome del computer e come chi entrerà: è la difesa contro chi fa
   inquadrare un codice suo (QRLjacking: Comparitech, HKCERT). Il pulsante giallo è uno solo: **Collega**.
3. **Codici di breve durata** (HKCERT, "aging time"): ogni codice vale 2 minuti, poi il computer ne mostra uno nuovo da
   solo; dopo 5 codici si ferma e chiede "Mostra un codice nuovo" (niente richieste al server per ore se nessuno c'è).
4. **Niente dati nel codice**: il QR contiene solo un numero a caso e la chiave pubblica del computer (non segreta).
5. **La fotocamera si chiede quando serve** (guida Android): al tocco su "Collega un computer"; se negata, al posto
   dell'immagine una spiegazione precisa e un pulsante per riprovare; niente insistenze, nessun blocco del resto dell'app.
6. **Si risponde subito** (Doherty): il riquadro diventa giallo e il telefono vibra appena legge; "Collego…" mentre
   aspetta; computer e telefono dicono "entrato" nello stesso momento (fine curata, peak-end).
7. **Un aiuto solo quando serve**: se in 10 secondi non legge niente, una riga "Avvicina il telefono o alza la luminosità
   dello schermo" (consigli di Signal); nessuna istruzione fissa in piccolo.
8. **Un'altra strada c'è sempre** (ricerca sulle cadute dei QR tra dispositivi): "Entra con email e password" resta, come
   link sotto i passi; e se il computer è fuori ufficio lo si dice chiaramente invece di far aspettare.
9. **Si toglie quando si vuole**: il computer collegato è una sessione come le altre (Amministrazione › Dispositivi,
   "Scollega tutti").

Fonti: Android "Request runtime permissions" (developer.android.com/training/permissions/requesting); Comparitech "What
is QRLjacking"; HKCERT "Introduction of QR code attacks and countermeasures"; MojoAuth "The cross-device passkey QR
flow: where users drop off"; guide di WhatsApp (dispositivi collegati) e Signal (collegare Signal Desktop).

## 2. Come funziona

```
 computer (pagina di accesso)            server di casa (NAS)                      telefono (già entrato)
 1. crea chiavi P-256 + id a caso
    mostra il QR  ───────── inquadra ──────────────────────────────────────▶ 2. legge il QR, chiede conferma
                                                                              3. autorizzaComputer {id, chiave, nome}
                                         4. tiene {id → utente, chiave, nome}  ◀── (Bearer; da casa o da Google)
 5. ogni 2 s: attesaComputer {id} ────▶  (SOLO da casa, senza token)
                                         6. crea la sessione, cifra il pacchetto
 7. decifra: token + indirizzo Google ◀── {stato: 'pronto', ...}
    ed entra                                                                  8. statoComputer {id} → 'entrato'
```

- Il computer **deve essere in ufficio** (rete del server): prima del collegamento non conosce l'indirizzo Google, e
  `attesaComputer` da Google o dall'ingresso HTTPS è rifiutata. Il telefono invece può passare anche da Google.
- Chi ha visto il QR (una foto, uno che passa) non ottiene niente: il pacchetto è cifrato con la chiave del computer, la
  cui parte privata non lascia mai la memoria del programma.

## 3. Il codice QR

Testo (modalità byte, correzione M): `wisper-collega:1:<id>:<chiave>:<nome>`

- `id`: 16 byte casuali in base64url senza `=` (22 caratteri).
- `chiave`: chiave pubblica P-256 **compressa** (33 byte, `02`/`03` + X) in base64url (44 caratteri).
- `nome`: nome del computer (`Environment.MachineName`), al massimo 32 caratteri, con `encodeURIComponent`.
- Il telefono rifiuta (e continua a inquadrare, con la riga "Questo non è un codice di Wisper Ufficio") qualunque altro
  testo, versione diversa da `1`, id o chiave della lunghezza sbagliata.

Il QR lo disegna la pagina (`pc/ui/qr.js`, scritto a mano, nessuna libreria): versioni 1-10, modalità byte, correzione M,
le 8 maschere con la penalità dello standard, zona di silenzio di 4 moduli; SVG nero su bianco **anche in tema scuro**
(i lettori leggono meglio scuro su chiaro). Al centro niente simbolo (con correzione M non c'è margine).

## 4. Le azioni del server

Nuovo file `server/src/azioni/collega.js`, registrato in `richieste.js`. In memoria (una `Map`), niente tabella: se il
server si riavvia, chi stava collegando rifà il QR.

### `autorizzaComputer {id, chiave, nome}` (con token; da casa o da Google)

- Controlli: `id` 22 caratteri base64url; `chiave` 44 caratteri base64url che decodificati sono un punto P-256 valido
  (`crypto.createECDH('prime256v1').computeSecret` non deve lanciare); `nome` testo di 1-32 caratteri senza caratteri di
  controllo. Altrimenti `{ok: false, errore: 'Questo non è un codice di Wisper Ufficio'}`.
- Un `id` già usato: `{ok: false, errore: 'Questo codice è già stato usato: sul computer ne compare uno nuovo'}`.
- Al massimo 5 autorizzazioni in attesa per utente (le più vecchie si buttano).
- Tiene `{idUtente, idSessioneTelefono, chiave, nome, quando, stato: 'autorizzato'}` per **2 minuti**.
- Risposta: `{ok: true, nome}`. Registro: "Collegamento col QR autorizzato per <nome>".
- Nessun permesso di modulo: ogni utente può collegare un computer **per sé**, con i suoi permessi.

### `attesaComputer {id}` (senza token; **solo da casa**)

- Da Google o dall'ingresso (`provenienza().daFuori`): `{ok: false, errore: 'Il collegamento col telefono si fa solo in
  ufficio'}`.
- `id` sconosciuto: `{ok: true, stato: 'attesa'}` (sempre la stessa risposta: non si capisce se un id esiste).
- `id` autorizzato e non scaduto: crea la sessione come `accedi` (stesso utente, app "Wisper Ufficio · <nome>", stessa
  durata, stessa riga in Accessi con nota "col QR"), costruisce il **pacchetto** = la stessa risposta che darebbe `accedi`
  (`ok`, `token`, `utente`, `permessi`, …) più `google` (l'indirizzo dello script se il NAS ce l'ha in
  `WISPER_POSTINO_URL`, altrimenti assente); lo cifra (§5); segna lo stato `entrato` (tenuto altri 5 minuti per
  `statoComputer`) e risponde `{ok: true, stato: 'pronto', chiave: <pubblica del server, NON compressa, 65 byte
  base64url>, iv: <12 byte base64url>, dati: <cifrato+tag base64url>}`. **Una volta sola**: la richiesta dopo dice `attesa`.
- Utente disattivato nel frattempo: `{ok: true, stato: 'rifiutato'}`.

### `statoComputer {id}` (con token, stesso utente che ha autorizzato)

`{ok: true, stato: 'autorizzato' | 'entrato' | 'scaduto', nome}`. Serve al telefono per dire "UFFICIO-PC è entrato" o,
dopo 30 secondi di `autorizzato`, "Il computer non ha risposto".

## 5. La cifratura (identica in Node e C#)

- Il server crea una chiave ECDH P-256 nuova per ogni pacchetto; `segreto = ECDH(server privata, computer pubblica)`
  (32 byte, la X del punto).
- `chiaveAes = HKDF-SHA256(ikm = segreto, salt = id (16 byte), info = "wisper-collega-1", 32 byte)`.
- AES-256-GCM, `iv` 12 byte casuali, AAD = id (16 byte), tag 16 byte in coda al cifrato.
- Node: `crypto.createECDH`, `crypto.hkdfSync`, `crypto.createCipheriv('aes-256-gcm')`. C# (.NET 8):
  `ECDiffieHellman.DeriveRawSecretAgreement`, `HKDF.DeriveKey`, `AesGcm`.
- Prova condivisa: `server/prove/casi-collega.json` con chiavi fisse, id, pacchetto in chiaro e risultato atteso; la
  provano sia il server (cifra e confronta) sia il computer (decifra il caso del server in un test).

## 6. Il computer (Wisper Ufficio)

- C# (`pc/WisperUfficio/CollegaQr.cs`): tiene in memoria al massimo 2 coppie di chiavi (quella del QR di adesso e la
  precedente, per 20 secondi: il telefono potrebbe aver letto quella vecchia). Endpoint locali della pagina:
  - `POST /locale/collega-qr` → `{testo}` (nuovo id e chiave; il testo da mettere nel QR);
  - `GET /locale/collega-qr-stato` → chiede `attesaComputer` al server di casa per gli id vivi e risponde
    `{stato: 'attesa' | 'entrato' | 'lontano' | 'rifiutato', utente?}`; con `pronto` decifra, salva token e indirizzo
    Google come fa `accedi` + file `.wisper` (cifrati con DPAPI), e risponde `entrato` col nome.
  - Server di casa che non risponde (1,5 s) → `lontano`.
- Pagina (`pc/ui/app.js`, `vistaAccesso`, come il prototipo): carta larga con QR a sinistra (300 px) e "Entra col
  telefono" + tre passi a destra; sotto, link "Entra con email e password" che mostra il modulo di oggi (con "Torna al
  codice del telefono"); riga del server in fondo com'è oggi. Il QR si rinnova ogni 2 minuti, 5 volte; poi è sfocato con
  "Mostra un codice nuovo". `lontano` → "Il server dell'ufficio non risponde" + Riprova + Entra con email e password.
  `entrato` → spunta animata "Entrato come <nome>" per 1,2 s e poi la Dashboard. Si chiede lo stato ogni 2 secondi solo
  mentre la pagina è visibile.
- Regole senza grafica in `pc/ui/regole-collegamento.js` (testo del QR, scadenze, frasi), con prove in `pc/prove/`.

## 7. Il telefono

- Voce nel menu laterale, nel gruppo in basso prima di Impostazioni: **Collega un computer** (icona schermo). Non in
  modalità esempio (visita guidata): lì la voce non c'è.
- Schermata a tutto schermo: anteprima della fotocamera (CameraX `PreviewView`), velo scuro traslucido con finestra
  quadrata di 250 dp ad angoli arrotondati e angoli bianchi; sotto "Inquadra il codice sul computer". Lettura con ZXing
  core (`MultiFormatReader` solo QR, `ImageAnalysis` con `STRATEGY_KEEP_ONLY_LATEST`, 1280×720).
- Letto un codice valido: vibrazione breve, angoli gialli, analisi ferma, **foglio dal basso**: "Collegare questo
  computer?", riquadro col nome del computer, "Entrerà come <nome utente>, con i tuoi stessi permessi. Lo scolleghi quando
  vuoi da Amministrazione › Dispositivi.", **Collega** (giallo) e Annulla (testo, riprende a inquadrare).
- Collega → "Collego <nome>…" → `autorizzaComputer`, poi `statoComputer` ogni 1,5 s fino a 30 s: `entrato` → spunta
  "<nome> è entrato" + Fatto; altrimenti "Il computer non ha risposto" + "Deve essere in ufficio, sulla stessa rete del
  server, con la pagina del codice aperta." + Riprova. Errori del server: la frase del server, + Riprova.
- Permesso: si chiede entrando nella schermata; negato → "Serve la fotocamera" + "Senza fotocamera non posso leggere il
  codice sul computer." + **Consenti la fotocamera** (se il sistema non mostra più la richiesta: apre le impostazioni
  dell'app). 10 secondi senza codice → riga "Avvicina il telefono o alza la luminosità dello schermo".
- Dipendenze nuove (gratis, Apache 2.0): `androidx.camera:camera-camera2`, `camera-lifecycle`, `camera-view`,
  `com.google.zxing:core`. Permesso `CAMERA` nel manifest con `<uses-feature android:name="android.hardware.camera.any"
  android:required="false"/>`.

## 8. Cosa non cambia

`accedi` con email e password resta uguale; i permessi sono quelli dell'utente che inquadra; il token del computer vale
come quello di `accedi` (180 giorni, si revoca da Dispositivi); nessun segreto nel QR, nei log o nel registro.

## 9. Decisioni prese costruendo (02/11/2026, server e computer)

Dove l'accordo taceva o lasciava un buco, si è scelto così (in modo sicuro). Il telefono è di un altro costruttore.

**Server** (`server/src/azioni/collega.js`, prove `server/prove/collega.test.js`, caso fisso `server/prove/casi-collega.json`)

1. **`google` nel pacchetto solo se la porta Google è configurata e accesa** (`WISPER_POSTINO_URL` col segreto e
   `WISPER_PORTA_GOOGLE` diverso da `no`). Con la porta spenta lo script non ha ancora `Porta.gs`: un computer che avesse
   l'indirizzo ci manderebbe `accedi` e le richieste da fuori, e non funzionerebbe niente. Oggi sul NAS è `no`, quindi un
   computer collegato col QR resta "solo in casa"; quando la porta si accende, i computer collegati prima l'indirizzo non
   lo sanno: va rifatto il QR (o il file `.wisper`).
2. **Accessi**: la tabella non ha una colonna "nota". La riga della sessione nuova la scrive `attesaComputer` con azione
   **`accedi col QR`**, esito `ok`, l'utente e il nome del computer. Le risposte `attesa` (ogni 2 secondi) e `pronto` non
   lasciano altre righe (`registra` nella voce di `richieste.js`): riempirebbero gli accessi. I rifiuti da fuori sì.
3. **Registro**: tabella `collegamenti_qr`, riga = nome del computer, nota "Collegamento col QR autorizzato per
   <nome>". Il computer la dice "Manuel ha collegato col telefono il computer UFFICIO-PC" (`pc/ui/regole.js`).
4. **Il pacchetto non si tiene fra le richieste già fatte** (`ricordo.js`): c'è il token, anche se cifrato, e vale una
   volta sola. Il computer non manda `idRichiesta`.
5. `autorizzaComputer` vuole una **sessione vera** (il ponte delle versioni vecchie no). Gli **esterni** possono, come
   possono entrare con email e password (`AZIONI_ESTERNO`). `attesaComputer` vuole una POST.
6. **`rifiutato`** anche se, nel frattempo, il telefono che ha autorizzato è uscito o è stato scollegato (non solo se
   l'utente è disattivato): l'autorizzazione era sua.
7. **Il nome**: 1-32 caratteri contati come code point, senza caratteri di controllo **né di formato** (categorie Cc e
   Cf: niente scritte rovesciate che cambino quello che il telefono fa confermare).
8. **Id già usato**: rifiutato per un'ora anche dopo che la voce è sparita dalla memoria (al massimo 2000 id ricordati).
9. **`statoComputer`** per un id di un altro utente, o che non c'è più: `{ok: true, stato: 'scaduto', nome: ''}` (non si
   capisce se l'id esiste).
10. **La sessione**: `disp` = l'id di dispositivo che il computer manda con `attesaComputer` (se manca `qr-<id>`),
    `disp_nome` = il nome confermato dal telefono, `app` = "Wisper Ufficio · <nome>" tagliata a 40 caratteri (la colonna).
    `accedi` e il QR creano la sessione con la stessa funzione (`creaSessione` in `azioni/accesso.js`).
11. Se la risposta `pronto` si perde per strada, la sessione resta creata ma il computer non entra: dopo 2 minuti mostra un
    codice nuovo, e la sessione rimasta si toglie da Amministrazione › Dispositivi (il pacchetto vale una volta sola).

**Computer** (`pc/WisperUfficio/CollegaQr.cs`, `pc/ui/app.js` `vistaAccesso`, `pc/ui/regole-collegamento.js`, `pc/ui/qr.js`)

12. **Il nome nel QR**: il computer toglie i caratteri di controllo e di formato e taglia a 32 caratteri e a 128 byte
    scritti con `encodeURIComponent` (così il testo sta nella versione 10; il caso peggiore è provato). C# scrive come
    `encodeURIComponent` (lascia `! ' ( ) *`): stesso testo della pagina, provato dall'exe.
13. **Le chiavi** vivono al massimo 2 minuti e 20 secondi anche se la pagina non ne chiede altre (dopo 5 codici, pagina
    chiusa); dopo l'ingresso si buttano tutte.
14. **`lontano`** solo se nessuna delle domande (una per chiave viva) ha avuto risposta in 1,5 secondi; una risposta
    `ok:false` del server (per esempio un indirizzo di casa che è in realtà l'ingresso HTTPS) conta come "non risponde".
    La pagina: alla prima domanda basta un `lontano` (non si mostra un codice che non può funzionare), dopo ne servono 2 di
    fila (un singhiozzo non fa sparire il codice); in `lontano` smette di chiedere fino a **Riprova**.
15. **La pagina si apre sul codice solo se c'è l'indirizzo di casa**; senza (solo Google), il modulo. Se il programma il
    codice non lo sa fare (il finto ponte coi dati di esempio o con `--google`), il modulo. Con la pagina nascosta il giro
    è fermo (niente domande, niente codici nuovi); tornando in vista si chiede subito, e se il codice è scaduto ne
    compare uno nuovo. Dopo **Esci** la pagina rilegge lo
    stato del programma (il nome dello studio sotto il titolo) e riparte dal codice.
16. **`rifiutato`** sulla pagina: riquadro rosso "Il telefono che ha inquadrato il codice non può più entrare: chiedi al
    titolare. Qui sotto c'è un codice nuovo." e un codice nuovo (il riquadro sparisce col codice dopo).
17. **Il riquadro del QR** è di 300 px **senza margine interno**: il bianco intorno è la zona di silenzio di 4 moduli,
    disegnata dall'SVG (nel prototipo c'erano 18 px di margine intorno a un QR finto senza zona). "Entra con email e
    password" e "Torna al codice del telefono" sono alti 48 px (nel prototipo 44) per la regola dei tocchi.
18. **Il modulo con email e password** è quello di oggi (campi da 56 px, Entra 64 px, "Usa il file dell'email") dentro la
    carta da 440 px. **Cambia** nella riga del server apre il modulo con gli indirizzi: un indirizzo di casa nuovo si salva
    entrando con la password, come oggi, e da lì vale anche per il codice.
19. **Prove dell'exe senza finestra** (`Program.cs`): `--prova-collega <casi> <esito>` decifra il caso fisso;
    `--prova-collega-vivo <testo> <esito>` (con `--dati` e `--server`) fa il giro vero contro un server di prova
    (`pc/prove/collega-exe.test.js`, che fa la parte del telefono).
20. **Le prove dei flussi già esistenti** (`prova-flussi*.js`, `prova-exe.js`, `prova-porta-exe.js`) hanno un passo in più:
    il clic su "Entra con email e password", come farebbe una persona.
21. **I campioni per il telefono** (`pc/prove/qr-campioni.json`): un elenco di `{testo, versione, maschera, matrice}`; la
    matrice è il simbolo senza la zona di silenzio (lato 17 + 4 × versione), "1" = modulo scuro: per leggerlo come
    immagine vanno aggiunti 4 moduli chiari per lato. Controllati qui con ZXing 3.4.1 (dalla cache di Gradle), anche dalle
    schermate vere della pagina in chiaro e in scuro.

**Limite noto.** Prima del collegamento il computer non può controllare che all'indirizzo di casa ci sia il server vero (la
firma di casa vuole un token, porta-google.md §8). Un apparecchio finto sulla stessa rete non ottiene niente dal computer
(gli arriva solo l'id), ma potrebbe dargli una chiave d'accesso sua e un indirizzo Google falso: lo stesso limite di
"Non usare Google" con la password (§14bis). Da chiudere insieme, con una chiave del server conosciuta dalle app.

## 10. Decisioni prese costruendo (02/11/2026, telefono)

**Telefono** (`app/`: `rapportino/CollegaQr.kt`, `ui/CollegaComputer.kt`, `PonteServer.autorizzaComputer/statoComputer`;
prove `CollegaQrTest`, `QrIncrociatoTest`, `ServerDiProvaCollegaTest`)

1. **La lettura del QR è severa quanto il server, e un po' di più**: la chiave dev'essere un punto vero di P-256 (calcolo
   sulla curva, niente rete), id e chiave in base64url scritto in un modo solo; il nome come lo scrive
   `encodeURIComponent` (un `+` non è uno spazio, un `:` o uno spazio scritti così come sono no), UTF-8 senza errori, da 1
   a 32 caratteri contati in unità UTF-16 (mai meno dei code point del server), senza caratteri di controllo, di formato
   (testo rovesciato, spazi invisibili), separatori di riga, uso privato o non assegnati. Testi oltre 512 caratteri no.
   Una versione diversa da `1` dice la stessa riga "Questo non è un codice di Wisper Ufficio".
2. **Quella riga** compare nella stessa riga scura dell'aiuto, per 3 secondi dall'ultimo QR sbagliato, e ha la precedenza
   sull'aiuto dei 10 secondi.
3. **`statoComputer` parte con la POST**: per il server è una lettura, ma con la POST vale comunque. La prima domanda
   1,5 s dopo la risposta di `autorizzaComputer`; i 30 secondi contano da lì; una domanda appesa non allunga l'attesa oltre
   i 30 secondi; un giro senza rete non ferma niente; `scaduto` dice subito "Il computer non ha risposto".
4. **Lo stesso id di richiesta per lo stesso QR** (`IdRichiesta.perOperazione("collega-qr-<id>")`): se la risposta di
   `autorizzaComputer` si perde, o dopo Riprova si inquadra lo stesso codice, il server ridà la risposta di prima
   (`ricordo.js`) invece di "già usato". Se la rete cade si riprova una volta da soli; alla seconda: "Il server non
   risponde: controlla la rete e riprova".
5. **Connessioni ferme (un buco di tutto il telefono, trovato qui)**: il server (Node) chiude le connessioni ferme da 5
   secondi, OkHttp le controllava solo dopo 10. Una scrittura (che non si ripete da sola) fatta fra 5 e 10 secondi dopo
   l'ultima richiesta partiva su una connessione già chiusa e cadeva ("unexpected end of stream"): provato contro il
   server di prova (dopo 7 e 8 secondi di pausa cadeva, dopo 11 no), ed è proprio il tempo fra l'apertura della fotocamera
   e Collega. In `PonteServer` le connessioni ferme si buttano dopo 4 secondi: vale per tutte le richieste del telefono.
   Prova `ServerDiProvaCollegaTest` ("7 secondi dopo"). Dal lato del server si potrebbe anche allungare `keepAliveTimeout`.
6. **La fotocamera di sistema**: col permesso `CAMERA` dichiarato nel manifest, Android fa partire la fotocamera di sistema
   solo se il permesso è dato (altrimenti l'app si chiude con SecurityException). Tutte le foto di prima (scontrino e
   foglio firmato del rapportino, spese, ticket, guasti e km dei mezzi, documenti) passano ora da `ui/FotoSistema.kt`: la
   prima volta chiede il permesso; se lo si nega la foto non parte, come uno scatto annullato, con l'avviso "Per la foto
   serve la fotocamera: puoi darle il permesso nelle impostazioni di Android". La galleria non cambia.
7. **Errori del server** sulla pagina piena: titolo "Il computer non è entrato", la frase del server, **Riprova** (torna a
   inquadrare, come "Il computer non ha risposto"). Accesso scaduto: "Sei uscito da questo dispositivo: entra di nuovo".
8. **La fotocamera che non si apre** (nessuna fotocamera, o occupata): "La fotocamera non si apre" / "Chiudi le altre app
   che la usano e riprova. Sul computer si entra anche con email e password." + Riprova. Senza fotocamera dietro si usa
   quella davanti.
9. **La vibrazione** è quella del tocco di sistema (CONFIRM da Android 11, prima LONG_PRESS): niente permesso nuovo; chi ha
   tolto la vibrazione al tocco non la sente.
10. **La voce del menu** sta in cima al gruppo in basso, sopra lo stato del collegamento ed Esci (nel menu del telefono
    Impostazioni non c'è). C'è anche per gli esterni (il server li fa collegare, §9.5); non nella visita guidata.
11. **La schermata è una pagina a tutto schermo** (come il rapportino), fuori dal menu. Indietro col foglio aperto =
    Annulla, altrimenti chiude. Girando il telefono si riparte da "Inquadra". Sulla fotocamera le icone della barra di stato
    sono chiare; il foglio di conferma non ha velo in più (si vede la fotocamera, come nel prototipo).
12. **Misure**: i pulsanti gialli sono quelli del prototipo (54 dp, 17/700), non i 64 del pulsante principale di
    `aspetto.md`; Annulla è alto 48 dp (nel prototipo 44, senza dimensione del carattere: qui 16/700 sottolineato); la riga
    "Wisper Ufficio su Windows" è 14/600 come il testo secondario dell'app. La rotella di "Collego…" è quella del prototipo
    (dura al massimo 30 secondi), ferma con meno animazioni come la spunta, il foglio e la finestra.
13. **Il permesso**: se Android non mostra più la richiesta, **Consenti la fotocamera** apre le impostazioni dell'app;
    tornando col permesso dato si inquadra subito.
14. **Il lettore**: ZXing sul piano Y di tutta l'immagine (chiesta 1280×720; l'emulatore dà 1280×960), solo QR, senza
    suggerimento sulla codifica (il testo del collegamento è ASCII). Lo stesso lettore (`LettoreQrZxing`) legge nelle
    prove le matrici di `pc/ui/qr.js`, anche girate di 90°.
15. **Solo per le prove**: `app/src/debug/.../ProveCollega.kt` dà alla schermata il testo dell'extra `collegaQr`
    dell'Intent come se l'avesse letto la fotocamera; nella build di rilascio `app/src/release/.../ProveCollega.kt` non
    legge niente.
