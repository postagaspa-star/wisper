# Progetti, funzioni tutte spegnibili, aggiornamenti annunciati dal NAS (03/11/2026)

Richieste di Manuel dopo la prima sera di uso vero (03/11/2026), riportate da Andrea:

1. **Ripartire da zero**: "ripulire tutto il database, eliminare tutti i dati". Fatto la sera stessa sul NAS con
   `server/strumenti/svuota.js` (copia intera prima in `dati-prima-della-pulizia-20261103-2224`). Restano gli account, i
   telefoni e i computer collegati, le impostazioni e le numerazioni (il prossimo codice commessa continua dal più alto già
   dato, così non nascono due commesse con lo stesso codice dei documenti di prima).
2. **Nessuna funzione obbligatoria**: "tutti i moduli selezionabili, nessuno obbligatorio".
3. **Gerarchia nuova**: cliente → commesse → **progetti** → rapportini. Ogni progetto ha il nome di chi è intestato
   (facoltativo ma sempre visibile, per tutti i clienti), un codice (a mano le prime volte, poi automatico seguendo la forma
   dei primi) e una descrizione. Sezione a parte nel menu laterale.
4. **Aggiornamenti spinti dal NAS**: "non è l'app a controllare ogni volta nuovi aggiornamenti sul NAS, ma è il NAS ad
   avvisare l'app ogni volta che c'è un aggiornamento", con un avviso "silenzioso e invisibile".

Server 0.12.0 (schema 9), telefono 1.1.0 (codice 10), computer 1.1.0.

## 1. Parole sullo schermo

- La sezione si chiama **Progetti**, la scheda **Progetto**. Campi: **Commessa**, **Codice**, **Intestato a**,
  **Descrizione**, stato **Aperto** / **Chiuso**.
- La parola "sotto-cliente" è di Andrea e **non compare mai** nell'app (né "cliente finale"): il campo è **Intestato a**.
- **Intestato a** è facoltativo ma non nascosto: sta nel modulo del progetto, sempre visibile, per qualunque cliente (non
  solo Elettrodinamica), subito sotto il codice.
- Niente frasi d'aiuto fisse sotto i campi (regola di Andrea). Il codice proposto è già scritto nel campo e si può
  cambiare; se Wisper non ha ancora imparato la forma, il campo è vuoto.

## 2. Dati e azioni (server 0.12.0)

Tabella `progetti` (migrazione `009-progetti`): `id`, `id_locale` (dal telefono), `commessa_id`, `codice`,
`intestato_a`, `descrizione`, `stato` (`APERTO`|`CHIUSO`), `codice_automatico`, `utente_id`, `creato`, `modificato`.
Il cliente del progetto è quello della sua commessa. Il codice non si ripete fra i progetti **dello stesso cliente**
(maiuscole e minuscole uguali). Nei rapportini: `id_progetto` e `progetto` (il codice).

Modulo nuovo dei permessi: **`progetti`**, nel menu subito dopo `commesse`. Ogni ruolo ha sui progetti lo stesso livello
che ha sulle commesse (titolare e amministrazione 2, collaboratore, lettura ed esterno 1).

Un progetto come lo manda il server:

```json
{ "id": 7, "idLocale": "", "idCommessa": "26ST001", "idCliente": "C0003", "codice": "ED-003",
  "intestatoA": "Rossi Srl", "descrizione": "Quadro QE1", "stato": "APERTO", "codiceAutomatico": true,
  "creato": "2026-11-03T21:40:00+01:00", "modificato": "…", "rapportini": 2, "ore": 6.5, "ultimoRapportino": "2026-11-03" }
```

| Azione | Permesso | Dati | Risposta |
|---|---|---|---|
| `progetti` | progetti 1 | `idCommessa?`, `idCliente?`, `stato?` (APERTO/CHIUSO), `cerca?` | `progetti` (i più recenti prima) |
| `progetto` | progetti 1 | `id` | `progetto`, `rapportini` (come l'azione `rapportini`) |
| `codiceProgetto` | progetti 1 | `idCommessa`; per una commessa che nasce col rapportino `idCliente?` e `idCommessa?` = il codice che avrà (non rifiuta mai: è una proposta) | `codice` (vuoto se non c'è ancora una forma: allora le app chiedono il codice a mano, anche nel progetto nuovo del rapportino), `da`: commessa/cliente/tutti |
| `creaProgetto` | progetti 2 | `idCommessa`, **`codiceProgetto`** (vuoto = quello proposto), `intestatoA?`, `descrizione`, `idLocale?`, `codiceProposto?` | `progetto` (+ `giaEsisteva`) |
| `aggiornaProgetto` | progetti 2 | `id`, `campi`: `codice?`, `intestatoA?`, `descrizione?`, `stato?`, `idCommessa?` | `progetto` |
| `togliProgetto` | progetti 2 | `id` | `ok` (solo senza rapportini) |

Attenzione: in `creaProgetto` il codice va in **`codiceProgetto`**, non in `codice`: `/exec` toglie `codice` da ogni
richiesta (era il codice d'accesso del foglio). Dentro `campi` e dentro `progettoNuovo` si chiama `codice`.

Frasi di rifiuto che le app mostrano così come sono: "Scrivi il codice del progetto: dopo i primi due Wisper lo propone
da solo", "Il codice X è già di un altro progetto di questo cliente", "Il progetto ha già dei rapportini: la commessa non
si cambia", "Il progetto ha dei rapportini: non si toglie, si chiude", "Scegli la commessa del progetto", "Scrivi la
descrizione del progetto".

`anagrafiche` porta anche **`progetti`** (tutti, per chi vede progetti o rapportini; l'esterno solo quelli delle commesse
dei suoi incarichi): il telefono li tiene per lavorare senza rete.

Il rapportino:

- in uscita: `idProgetto` (numero o null), `progetto` (codice), `progettoDescrizione`, `progettoIntestatoA`;
- `salvaRapportino` accetta `idProgetto` (un progetto che c'è: la commessa del rapportino deve essere la sua; se il
  rapportino non dice la commessa, la prende dal progetto) oppure **`progettoNuovo`** `{idLocale, codice, codiceProposto,
  intestatoA, descrizione}` (nato sul telefono, anche senza rete: si crea sotto la commessa del rapportino; lo stesso
  `idLocale` rimandato non fa un secondo progetto; serve progetti 2);
- l'azione `rapportini` filtra anche per `idProgetto`.

Il server non rifiuta un rapportino senza progetto (le code dei telefoni e le versioni vecchie): il progetto lo chiedono le
app (§4).

## 3. Il codice proposto

La regola è una sola, in `server/src/codici-progetto.js` (`proponiCodice(progetti, {idCommessa, idCliente, anno})`), con i
casi condivisi in `server/prove/casi-codici-progetto.json`: **il telefono la porta in Kotlin e deve ritrovare tutti i
casi** (come `conti.js`). Il computer chiede `codiceProgetto` al server.

In breve: si guardano gli ultimi tre codici (o gli ultimi due, se i tre non hanno una forma comune) dei progetti della
stessa commessa, poi dello stesso cliente, poi di tutti. Le parti fisse devono essere uguali, un solo numero deve
cambiare (il contatore, con gli zeri davanti se li hanno); il codice della commessa dentro il codice e l'anno di nascita
del progetto (4 o 2 cifre) si riconoscono. Il nuovo è il più alto più uno (con la commessa nel codice si conta dentro la
commessa nuova, da 1; con l'anno si conta fra quelli dell'anno di oggi, se ce ne sono). Mai un codice già dato a un
progetto dello stesso cliente.

Telefono senza rete: propone col codice locale (progetti delle anagrafiche più quelli nati sul telefono e ancora in coda)
e manda `codiceProposto: true`; se nel frattempo il codice è stato preso, il server usa il successivo libero.

## 4. Schermate (telefono e computer, stesso disegno delle Commesse: `docs/aspetto.md`)

1. **Menu laterale**: voce **Progetti** subito sotto Commesse (chi ha progetti ≥ 1 e la funzione accesa).
2. **Elenco Progetti**: cerca (codice, intestato a, descrizione, commessa); filtro Aperti (di base) / Chiusi / Tutti; per
   ogni riga il codice in evidenza, la descrizione, "Intestato a …" se c'è, cliente · commessa, quanti rapportini e ore.
   Un solo pulsante giallo: **Nuovo progetto** (per chi ha progetti 2).
3. **Nuovo / Modifica progetto**: Commessa (scelta; già messa se si arriva da una commessa), Codice (già scritto quello
   proposto, cambiabile), Intestato a, Descrizione. La commessa si cambia solo finché il progetto non ha rapportini.
4. **Scheda progetto**: codice, descrizione, intestato a, cliente e commessa (che si aprono), stato con **Chiudi** /
   **Riapri**, i rapportini del progetto (si aprono), **Nuovo rapportino** con cliente, commessa e progetto già messi,
   **Togli** solo senza rapportini.
5. **Scheda commessa**: una parte **Progetti** con i suoi progetti e **Nuovo progetto**.
6. **Rapportino**: dopo la commessa, il campo **Progetto** (solo con la funzione Progetti accesa): i progetti aperti di
   quella commessa più **Nuovo progetto** (codice proposto, intestato a, descrizione) dentro il rapportino stesso; se la
   commessa ha un solo progetto aperto è già scelto. Con Progetti accesa il rapportino non si salva senza progetto (e
   quindi senza commessa); con Progetti spenta il campo non c'è e tutto resta come prima.
7. Elenchi e schede dei rapportini mostrano il progetto ("ED-003 · Quadro QE1"); il PDF del rapportino ha la riga
   **Progetto** (codice e descrizione) e, se c'è, **Intestato a**.
8. Visita guidata: i dati d'esempio hanno due o tre progetti, così la pagina non è vuota.

## 5. Funzioni tutte spegnibili

`funzioni` restituisce tutte e 19 le funzioni con `spegnibile: true`, `cosaCambia`, **`richiede`** (si accendono con lei)
e **`serveA`** (si spengono con lei). Dipendenze: commesse → clienti; progetti → commesse; preventivi, rapportini,
fatturazione, ticket, comunicazioni, portale → clienti; collaboratori → commesse. `salvaFunzioni {modulo, accesa}` applica
le dipendenze e risponde `anche: [{modulo, nome}]` (le altre cambiate).

Nelle app:

- Amministrazione › Funzioni: un interruttore per ognuna; prima di cambiare, il foglio di conferma dice `cosaCambia` e
  "Si spengono anche: …" (le `serveA` accese) oppure "Si accendono anche: …" (le `richiede` spente). Dopo, menu e permessi
  si rileggono (`io`).
- **Amministrazione spenta**: al titolare resta nel menu la voce Amministrazione con la sola pagina Funzioni (le azioni
  `funzioni` e `salvaFunzioni` per il titolare funzionano sempre). Gli altri non la vedono.
- **Dashboard spenta**: l'app si apre sulla prima voce accesa del menu.
- **Tutto spento**: una pagina vuota "Nessuna funzione accesa" e, per il titolare, il pulsante Funzioni.

## 6. Aggiornamenti annunciati dal NAS

Il server (`server/src/versioni.js`) legge ogni 10 minuti l'elenco firmato delle versioni (lo stesso `aggiornamento.json`
dell'ultima release su GitHub) e controlla la firma con la stessa chiave pubblica delle app. Lo annuncia in due modi:

- **in ogni risposta di `/exec`** (anche dalla porta Google e anche negli errori) c'è
  `"versioni": {"giro": 3, "android": {"codice": 10, "nome": "1.1.0"}, "computer": {"versione": "1.1.0"}}`. Unica
  eccezione: la risposta di `statoSistema` ha già il suo `versioni` (`{ultime, dispositivi}`, Amministrazione › Sistema),
  che il server non copre; le app considerano annuncio solo un `versioni` con `giro`;
- **`GET /campanello?giro=<n>`** (solo in casa: da internet non passa, dalla porta Google risponde subito senza aspettare):
  con un giro diverso da quello del server risponde subito; con lo stesso resta aperta finché l'elenco cambia (al massimo
  50 secondi), poi risponde `{ok, giro, versioni}` e l'app la riapre.

Le app:

- **non controllano più da sole ogni ora** (il lavoro periodico di prima va cancellato all'avvio: chi ha la 1.0.0 lo ha
  in coda);
- leggono `versioni` da ogni risposta; se la loro versione è più vecchia, scaricano da GitHub come oggi (elenco firmato,
  impronta SHA-256, stessa firma dell'APK) e installano al momento giusto, senza mostrare niente (telefono: app dietro e
  nessun rapportino a metà; computer: come oggi);
- finché sono aperte e parlano col server **in casa** (non dalla porta Google) tengono aperto il campanello; se cade,
  riprovano dopo 30 secondi;
- il pulsante "Controlla" a mano nelle impostazioni resta.
