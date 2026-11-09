# Fai: il design approvato (novembre 2026)

Tela: https://claude.ai/artifact/R6ZuAFak8qH1vmcXFMwPrS, riga 4. Copia in `docs/prototipo/Fai-telefono.dc.html`,
`Fai-spesa.dc.html`, `Fai-pc.dc.html`. Idea scelta da Andrea il 03/11/2026, approvata da Manuel il 09/11/2026.
Questa guida vince su `docs/aspetto.md` per colori, carattere, forme, casa e menu. Il resto di quella guida (testi,
visita guidata sulle schermate vere, pollice, niente tendine) vale ancora.

## 1. Carta d'identità

| | |
|---|---|
| Bisogno in una frase | Manuel apre Wisper per fare una cosa: non deve cercarla in un elenco |
| Gesto principale | Il pulsante della cosa da fare, grande, sotto il pollice |
| Casa | La cosa più importante su una scheda gialla, poi "Cosa vuoi fare?" con sei azioni, poi Da sistemare |
| Navigazione | Menu laterale con voci di una parola, icona colorata per voce e numerini |
| Tono | Vivace, chiaro, adulto. Colori sì, feste no |
| Carattere | Plus Jakarta Sans (SIL OFL 1.1), incluso nelle app; pesi 500-800 |
| Colori chiave | Giallo Wisper `#FFC53D` per la cosa più importante, un colore per ogni azione, fondo bianco |
| Forme | Grandi raggi, fondi tinti, nessun bordo; ogni azione ha una forma sua (fiore, cerchio, quadrifoglio, rombo, capsula) |
| Movimento | Molla leggera alla pressione, entrate a cascata, percorsi che scorrono di lato; tutto tolto con "meno animazioni" |

## 2. Decisioni prese il 09/11/2026

La tela è del 3 novembre: dopo sono cambiate alcune cose.

1. **"Segna le ore" diventa "Nuova commessa"** (le Ore sono state tolte il 07/11). Scelta di Andrea.
2. **"Fai firmare un rapportino" diventa "Invia un rapportino"**, col numero dei rapportini da inviare (la firma del
   cliente non c'è più dalla 1.2.0).
3. **La settimana coi giorni che mancano va in cima a Rapportini** (solo telefono: il computer non l'aveva), insieme al
   rapportino di oggi e a "Come ieri". Un giorno senza rapportino compare comunque in casa: è una voce della Dashboard
   del server (`giorni`).
4. **I riquadri dei numeri vanno in Vedi tutto** ("Tutto quello che c'è da fare"), con "Cambia i riquadri". Scelta di
   Andrea.
5. **Progetti** ha la sua voce sotto Commesse (nata la sera in cui si è fatta la tela): 19 voci, non 18. Colore proprio.
6. La spesa a tre passi c'è **sul telefono**, che è dove si fotografa lo scontrino. Sul computer il pulsante apre il
   modulo di sempre, nel nuovo aspetto.

## 3. Colori

| Ruolo | Chiaro | Scuro |
|---|---|---|
| Fondo della pagina | `#FFFFFF` | `#121316` |
| Scheda (senza bordo) | `#F4F5F7` | `#1E2025` |
| Foglio, finestra, campo | `#FFFFFF` | `#191B1F` |
| Superficie sopra le schede | `#ECEEF2` | `#2A2D33` |
| Barra laterale | `#F7F8FA` | `#17191D` |
| Riga sottile | `#E4E7EC` | `#2C2F35` |
| Bordo dei campi | `#D5D7DC` | `#4A4D55` |
| Testo | `#16171B` | `#F2F3F5` |
| Testo secondo | `#44474F` | `#D3D5DB` |
| Tenue | `#5C606A` | `#A4A8B2` |
| Molto tenue (solo disabilitato) | `#8B8F98` | `#767A84` |
| Collegamenti, fuoco | `#2F48D9`, anello `#3D5AFE` | `#9DB0FF`, anello `#9DB0FF` |
| Giallo Wisper | `#FFC53D`, testo sopra `#1A1A1A` | uguale |
| Etichetta sul giallo | `#4A3A00` | uguale |
| Voce attiva | `#FFF4D6` | `#3A2F14` |
| Verde | pieno `#12B76A`, tenue `#E0F6EC`, testo `#0B5F37` | `#12B76A`, `#14352A`, `#7FE3B4` |
| Rosso | testo `#B42318`, tenue `#FDE3E1`, pieno `#D92D20` | `#FFA8A8`, `#3A1C1C`, `#E03131` |
| Blu (Inviato) | testo `#2F48D9`, tenue `#E6EAFF` | `#9DB0FF`, `#1F2748` |

Le sei azioni (fondo della tessera · forma piena · tratto dentro la forma):

| Azione | Chiaro | Scuro (fondo) | Forma | Tratto |
|---|---|---|---|---|
| Scrivi un rapportino | `#FFF6DD` · `#FFC53D` | `#3A2F14` | fiore | `#1A1A1A` |
| Aggiungi una spesa | `#FFECE9` · `#FF6B57` | `#3B2421` | cerchio | `#1A1A1A` |
| Nuova commessa | `#E6EAFF` · `#3D5AFE` | `#1F2748` | quadrato tondo | `#FFFFFF` |
| Nuovo cliente | `#E0F6EC` · `#12B76A` | `#14352A` | quadrifoglio | `#0A0A0A` |
| Prepara un preventivo | `#EEE9FE` · `#7A5AF8` | `#2B2548` | rombo | `#FFFFFF` |
| Invia un rapportino | `#DFF5F9` · `#06AED4` | `#12353F` | capsula | `#0A0A0A` |

Le 19 voci del menu (fondo · tratto, chiaro; nello scuro il fondo è il tratto al 30% sulla scheda, il tratto è chiaro):

Casa `#16171B`·`#FFC53D` · Clienti `#DDF5E8`·`#067647` · Commesse `#FFEBD1`·`#B54708` · Progetti `#FFF0E6`·`#C4320A` ·
Preventivi `#ECE7FF`·`#5925DC` · Calendario `#DCE8FF`·`#1849A9` · Rapportini `#FFF0C2`·`#7A5600` · Spese `#FFE4DE`·`#B93815` ·
Fatture `#D9F4FA`·`#0E7090` · Banche `#DDF3EF`·`#107569` · Persone `#FCE7F6`·`#C11574` · Documenti `#EAECF0`·`#344054` ·
Ticket `#E0E7FF`·`#3538CD` · Mezzi `#F4EBDD`·`#8A5A12` · WhatsApp `#DCF8E7`·`#087443` · Portale clienti `#E0F2FE`·`#026AA2` ·
Collaboratori `#EAF8D7`·`#3B7C0F` · Integrazioni `#F2F4F7`·`#475467` · Impostazioni `#F2F4F7`·`#16171B`.

## 4. Carattere e forme

Telefono: titolo della casa 32/800 (-0,8), scheda gialla 22/800, titolo sezione 20/800 (-0,3), azione 18/700 (la
prima 19/800), riga 16/800 con dettaglio 14/600, etichetta 12/800 maiuscola. Computer: casa 40/800 (-1), gialla 26/800,
sezione 22/800, tessera 19/700.

Raggi: gialla e fogli 28, tessere 22 (telefono) e 26 (computer), righe 18, pulsanti 16-20, icone delle righe 14, pillole
999. **Nessun bordo sulle schede**, nessuna ombra sulle pagine; ombra solo sotto fogli e finestre. Molla:
`cubic-bezier(.34,1.56,.64,1)` in 240 ms, pressione scala .96. Entrate a cascata: 340 ms, 50 ms fra un pezzo e l'altro.

## 5. La casa

Dall'alto: Menu · simbolo e Wisper · cerchio con le iniziali; data e "Ciao {nome}"; **scheda gialla** con la prima voce
della Dashboard del server; **Cosa vuoi fare?** con le azioni che chi è entrato può fare (permesso di scrittura e funzione
accesa, altrimenti la tessera sparisce); **Da sistemare** con le voci successive (3 sul telefono, 4 sul computer) e Vedi
tutto; sul computer accanto **In agenda** (Oggi, Domani e i prossimi appuntamenti). Tasti del computer sulle tessere: R,
S, N, C, P, I.

Scheda gialla: per una fattura scaduta titolo "La fattura di {cliente} è scaduta", pillola "Scaduta da N giorni", importo,
"Fattura {numero}" e **Manda un promemoria**, che prepara il messaggio su WhatsApp (foglio sul telefono, finestra sul
computer) con le regole di sempre (chi riceve, consenso, "L'hai mandato?"). Per le altre voci: titolo, dettaglio e il
pulsante che dice cosa fa. Regola e casi condivisi: `pc/ui/regole-casa.js`, `pc/prove/casi-casa.json`,
`app/.../rapportino/Casa.kt`. Niente da fare: una riga verde calma.

## 6. Il menu

Voci corte di una parola, come nel prototipo: Casa, Clienti, Commesse, Progetti, Preventivi, Calendario, Rapportini,
Spese, Fatture, Banche, Persone, Documenti, Ticket, Mezzi, WhatsApp, Portale clienti, Collaboratori, Integrazioni e, staccata
da una riga sottile, Impostazioni. Nei Permessi e in Funzioni restano i nomi lunghi. Numerini neri; in fondo Collegato, chi
è entrato ed Esci.

## 7. La spesa a tre passi (telefono)

Quanto hai speso (importo con tastierino, tipo con le pillole Carburante, Pranzo, Materiale, Parcheggio, Altro) → Per quale
lavoro (commesse usate di recente, Nessuna commessa) → Hai lo scontrino (foto o Non ce l'ho) → Spesa salvata col riepilogo,
Torna a casa, Aggiungi un'altra. Colore: corallo. Va in coda come le altre spese, quindi funziona senza rete. Oggi
come data e la propria persona: per cambiarli o aggiungere dettagli si apre la spesa dall'elenco.

## 8. Tutte le altre pagine

Stesse informazioni e stessi comandi di prima, nel nuovo aspetto: fondo bianco, schede grigie senza bordo, campi bianchi
col bordo, pulsanti secondari pieni senza bordo, collegamenti blu, carattere nuovo, cerchi delle persone neri. Il pulsante
giallo resta l'azione principale di ogni pagina, uno per schermata. Il tema scuro segue le tabelle qui sopra.

I PDF non cambiano: restano in Figtree, come i documenti già mandati ai clienti.

## 9. Cosa non cambia

Dati, conti, permessi, stati, coda senza rete, firme, aggiornamenti, prove. Il server resta lo 0.13.2: la casa usa le voci
e l'agenda che manda già.
