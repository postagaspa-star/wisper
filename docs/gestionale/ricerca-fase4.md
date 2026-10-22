# Fase 4: ricerca (fatturazione, banche e scadenze)

Appunti raccolti il 22/10/2026 e completati lo stesso giorno per scrivere [`fase4.md`](fase4.md). **Tutto quello che
è fiscale va confermato col commercialista prima di usarlo con fatture vere** (elenco in fondo). Wisper prepara la
fattura e la emette il programma che Manuel usa già (decisione 5 della fase 0); la banca è solo uno scadenziario
(decisione 6).

## 1. La fattura di un perito industriale (regime ordinario)

- **Contributo integrativo EPPI**: 5% per i committenti privati dal 1° gennaio 2015 (era 4%), **2% verso le pubbliche
  amministrazioni**. Va in fattura, **entra nella base IVA** e **non entra nella base della ritenuta** ("non è soggetto
  ad Irpef e quindi non costituisce base imponibile ai fini del calcolo della ritenuta d'acconto"). Esempio della
  circolare: progetto 2.500,00 + contributo 125,00 = imponibile 2.625,00; IVA 22% 577,50; totale 3.202,50; ritenuta
  20% su 2.500,00 = 500,00; netto 2.702,50. È il caso 3 di `casi-fattura.json`.
  Fonte: circolare Fisco e Tasse 38/2015 (https://www.fiscoetasse.com/BusinessCenter/download/CDG_38_2015_Aumento_contributo_integrativo_EPPI.pdf);
  il 5% "del compenso professionale lordo" è ancora quello citato per il 2025-2026
  (https://fidocommercialista.it/eppi, https://www.partitaiva.it/scadenze-fiscali-contributi-eppi-2026/).
  Si paga anche sulle spese riaddebitate che non sono anticipazioni (il contributo si calcola sul volume d'affari IVA).
- **Ritenuta d'acconto 20%** solo se il cliente è sostituto d'imposta (società, enti, condomini, professionisti; non un
  privato), sul compenso **senza** contributo integrativo e senza anticipazioni. Nella fattura elettronica: `TipoRitenuta`
  `RT01` (persone fisiche), `CausalePagamento` `A` (lavoro autonomo abituale, codici del modello CU), sulle righe
  soggette `Ritenuta = SI`.
- **Spese**: le *anticipazioni* art. 15 DPR 633/72 (documento intestato al cliente, senza ricarico) vanno su righe con
  `Natura N1` ("Escluse ex art. 15"), fuori da IVA, contributo e ritenuta; le *spese proprie riaddebitate* (intestate allo
  studio: pedaggi, vitto, materiali) e il rimborso km entrano nel compenso e quindi in IVA, contributo e ritenuta.
  Esempio Fiscozen (cassa al 4%): compenso 1.000 + contributo 40 + IVA 22% su 1.040 = 228,80 + anticipazioni 150 =
  1.418,80 €.
- **Bollo** 2 € quando la parte senza IVA (le anticipazioni N1) **supera** 77,47 €: risposta all'interpello AdE
  491/2021 sulle fatture con corrispettivi imponibili e spese anticipate art. 15. Eccezione: le anticipazioni di
  **tributi dovuti dal cliente stesso** (marche, diritti) non fanno scattare il bollo.
  Fonti: https://www.informazionefiscale.it/imposta-di-bollo-fatture-elettroniche-spese-anticipate-imponibili-IVA,
  https://www.agendadigitale.eu/documenti/esperto-risponde/limposta-di-bollo-e-dovuta-anche-se-nelle-fattura-vi-sono-importi-assoggettati-ad-iva/.
  Nella fattura elettronica: `DatiBollo` (`BolloVirtuale = SI`, `ImportoBollo = 2.00`); il riaddebito al cliente, se si fa,
  è una riga N1. Il bollo delle fatture elettroniche si versa a trimestre (codici 2521, 2522, 2523, 2524; scadenze 2026:
  1° giugno, 30 settembre, 30 novembre, 1° marzo 2027; rinvii possibili sotto i 5.000 €) e l'Agenzia lo calcola nel
  portale Fatture e Corrispettivi.
  Fonti: https://www.informazionefiscale.it/bollo-fatture-elettroniche-codici-tributo-istruzioni-documenti-elettronici,
  https://www.studiopizzano.it/imposta-bollo-fatture-elettroniche-scadenza-30-settembre-2026/.
- **Quando si fattura**: per le prestazioni di servizi l'operazione è fatta **al pagamento** (o prima, se la fattura si
  emette prima); la fattura immediata va trasmessa entro **12 giorni**. Per questo molti professionisti mandano prima un
  **avviso di parcella** (pro forma, senza valore fiscale) e fatturano all'incasso. Wisper deve quindi accettare un
  incasso **prima** dell'emissione e ricordare i 12 giorni.
  Fonti: https://www.agendadigitale.eu/documenti/esperto-risponde/fattura-per-prestazione-di-servizi-quando-va-emessa/,
  https://fiscomania.com/emissione-fattura-professionista, https://flextax.it/fattura-per-perito-industriale/.
- **Ritenute che paga lo studio**: quando lo studio paga un altro professionista (fattura ricevuta con ritenuta) è lui
  il sostituto d'imposta: versa la ritenuta con F24, codice **1040**, entro il **16 del mese dopo il pagamento**.
  Fonte: https://www.fiscozen.it/guide/ravvedimento-ritenuta-1040/.
- **Contributi EPPI del perito** (soggettivo, integrativo, maternità) si versano con F24, sezione "Altri enti", codice
  ente 0009, causali E066 (1° acconto), E067 (2° acconto), E068 (saldo), E069-E072 (scaduti, interessi, sanzioni,
  spese legali) (stessa circolare 38/2015). In Wisper sono impegni scritti a mano.

## 2. Il formato FatturaPA che Wisper deve leggere (e scrivere come bozza)

Fonte unica: lo schema ufficiale **Fattura ordinaria v1.2.3**, valido dal 1° aprile 2025 (specifiche tecniche 1.9,
che hanno aggiunto TD29 e RF20):
https://www.fatturapa.gov.it/export/documenti/fatturapa/v1.4/Schema_VFPR12_v1.2.3.xsd, elenco dei documenti in
https://www.fatturapa.gov.it/it/norme-e-regole/documentazione-fattura-elettronica/formato-fatturapa/, novità in
https://www.informazionefiscale.it/Fattura-elettronica-2025-specifiche-tecniche-codice-TD29.

- Radice `FatturaElettronica` con attributo `versione` = `FPR12` (privati) o `FPA12` (pubblica amministrazione).
  `FatturaElettronicaHeader` (DatiTrasmissione, CedentePrestatore, CessionarioCommittente) + uno o più
  `FatturaElettronicaBody` (un file può contenere un **lotto** di fatture).
- `DatiGeneraliDocumento`: `TipoDocumento`, `Divisa`, `Data`, `Numero` (obbligatorio, 1-20 caratteri latini di base),
  `DatiRitenuta` (ripetibile: TipoRitenuta, ImportoRitenuta, AliquotaRitenuta, CausalePagamento, tutti obbligatori),
  `DatiBollo` (BolloVirtuale, ImportoBollo), `DatiCassaPrevidenziale` (TipoCassa, AlCassa, ImportoContributoCassa,
  ImponibileCassa, AliquotaIVA, Ritenuta, Natura, RiferimentoAmministrazione), `ImportoTotaleDocumento`, `Causale`
  (ripetibile).
- `TipoDocumento` che contano: **TD01** fattura, **TD02** acconto su fattura, **TD03** acconto su parcella, **TD04**
  nota di credito, **TD05** nota di debito, **TD06** parcella, TD24/TD25 differite. TD16-TD21 e TD29 sono integrazioni,
  autofatture e comunicazioni: Wisper non le gestisce.
- **`TipoCassa` dell'EPPI = `TC17`** ("Ente previdenza periti industriali e periti industriali laureati (EPPI)"),
  confermato dallo schema. (TC04 è Inarcassa: serve per leggere le fatture ricevute da ingegneri.)
- `Natura`: **N1** escluse art. 15; N2.1/N2.2 non soggette (N2.2 per il forfettario); N3.x non imponibili; N4 esenti;
  N6.x inversione contabile. N2, N3, N6 senza sottocodice non valgono più dal 2021.
- `RegimeFiscale`: **RF01** ordinario, RF19 forfettario.
- `DettaglioLinee`: NumeroLinea, Descrizione, Quantita, UnitaMisura, DataInizioPeriodo, DataFinePeriodo,
  PrezzoUnitario, PrezzoTotale, AliquotaIVA, Ritenuta, Natura, AltriDatiGestionali.
- `DatiRiepilogo` (uno per aliquota o natura): AliquotaIVA, Natura, ImponibileImporto, Imposta, EsigibilitaIVA,
  RiferimentoNormativo.
- `DatiPagamento`: `CondizioniPagamento` (TP01 a rate, **TP02 completo**, TP03 anticipo) e `DettaglioPagamento`
  (obbligatori ModalitaPagamento e ImportoPagamento; facoltativi DataScadenzaPagamento, IBAN, IstitutoFinanziario...).
  `ModalitaPagamento`: **MP05 bonifico**, MP01 contanti, MP02 assegno, MP08 carta, MP12 RIBA, MP19-21 SEPA, MP23 PagoPA.
- Le note di credito citano la fattura in `DatiFattureCollegate` (IdDocumento = numero, Data).
- I file arrivano **firmati** (`.xml.p7m`, busta CAdES/PKCS#7: il testo XML sta dentro `SignedData` →
  `encapContentInfo` → `eContent`, a volte spezzato in più pezzi e a volte con tutta la busta scritta in base64; RFC 5652,
  https://www.rfc-editor.org/rfc/rfc5652) o in chiaro (`.xml`), spesso in un `.zip`. I prefissi dei nomi (`p:`, `ns2:`,
  nessuno) cambiano da programma a programma: si legge il nome locale. Esistono librerie solo per estrarre l'XML dal
  p7m (per esempio https://packagist.org/packages/controlaltjeff/p7m-fattura-decoder): Wisper deve farlo da sé, senza
  dipendenze, e **non verifica la firma** (legge il contenuto).
- Accanto alle fatture possono esserci le **notifiche dello SDI**: ricevuta di consegna (RC), mancata consegna (MC),
  scarto (NS), metadati (MT). Si riconoscono dalla radice e citano il `NomeFile` della fattura.

## 3. Quali programmi accettano un XML dall'esterno

| Programma | Cosa importa | Cosa vuol dire per Wisper |
|---|---|---|
| Fatture in Cloud (TeamSystem) | Archivio zip di XML o P7M emessi e ricevuti "con il vecchio software", più le anagrafiche (https://www.fattureincloud.it/software-fatturazione/importazione-fatture) | È un **archivio**: la pagina non dice che una fattura importata diventi una bozza da inviare. Non è la strada per passare una bozza. |
| Aruba Fatturazione Elettronica | "Importa fatture inviate/ricevute": .xml, .p7m, anche in .zip, fino a 300 file da 5 MB e 30 MB per volta; le inviate diventano "Emessa e Consegnata" (https://www.aranzulla.it/come-importare-fatture-in-fatturazione-elettronica-di-aruba-1581423.html) | Anche qui è un archivio. Esporta le fatture in XML e in zip: **il ritorno verso Wisper funziona**. |
| Danea Easyfatt | Nessuna guida trovata sull'import di bozze XML | Da chiedere. |
| Odoo (modulo italiano) | Importa le fatture **ricevute** e le crea in bozza (https://apps.odoo.com/apps/modules/16.0/l10n_it_fatturapa_in) | Conferma che "XML → bozza" è comune per le ricevute, non per le emesse. |

**Conclusione**: non si può contare su un import di bozze XML. Il passaggio di base è un **prospetto** con tutti i
campi nell'ordine in cui un programma li chiede (da copiare o da guardare), più un XML "da completare" per chi lo
accetta; il ritorno (XML emesso, anche p7m e zip) invece funziona con tutti, perché ogni programma esporta l'XML. Il
punto che cambierà quando sapremo il programma è scritto in `fase4.md` §8.4.

## 4. Come si presentano fatture, incassi e scadenze (pattern dei programmi)

- **La fattura nasce dal lavoro, non si ribatte**: ore, spese, trasferte e rate concordate confluiscono in una pagina
  *Da fatturare*; si controlla e si manda. Prima dell'invio i totali della testata si confrontano con la somma delle
  righe; le note di credito sono collegate alla fattura che correggono (Pleya,
  https://www.pleya.it/funzionalita/fatturazione-elettronica).
- Stati: **Bozza** (da emettere) → **Emessa** → **Pagata in parte** → **Pagata**; **Scaduta** è un'indicazione che si
  calcola dalla scadenza, non uno stato; **Annullata** con nota di credito. I passaggi a pagata o in parte avvengono da
  soli quando si registra l'incasso (AffiniPay, BillingNow).
- In cima i totali per stato (da emettere, da incassare, scadute) e per ogni stato l'azione successiva (emettere,
  sollecitare) (Relay). Ricerca per numero, cliente, stato; colori di stato sempre con la parola.
- **Scadenziario su una linea del tempo sola**: fatture da incassare, da pagare e tributi insieme; previsione di cassa
  settimana per settimana sulle scadenze aperte; una rata di F24 pagata con più bonifici resta collegata a ognuno
  (Pleya, https://www.pleya.it/funzionalita/banca-e-scadenze). Lo scadenziario si riempie da solo con le fatture non
  saldate e gli F24 non pagati e si completa a mano con le scadenze personali e i pagamenti ricorrenti (Fatture in
  Cloud, https://www.fattureincloud.it/guida-gestione-incassi-pagamenti/scadenzario/).
- Il punto è il **quando**, non il totale del mese: elenco per data di entrate e uscite previste, col saldo che si
  aggiorna, e in rosso i giorni in cui il saldo previsto scende sotto una soglia scelta (guide alla previsione di cassa
  per PMI).
- Distinguere sempre **previsto**, **registrato** e **verificato in banca** (lo chiedono le specifiche: "importi
  previsti, registrati e realmente riconciliati"). Senza collegamento alla banca, "riconciliato" diventa una spunta a
  mano: "l'ho visto sull'estratto conto".
- I collegamenti che non ci sono (SDI, banca, import degli estratti conto) si vedono come "Non collegato" (specifiche
  §7), mai finti: Pleya stesso dice che senza collegamento diretto si importa un CSV o un OFX, che Wisper per ora non fa.

## 5. Da confermare col commercialista (prima delle fatture vere)

1. EPPI 5% nel 2026 per i privati, sul compenso comprese le spese riaddebitate e il rimborso km; dentro la base IVA,
   fuori dalla ritenuta.
2. Ritenuta 20% su compenso + spese riaddebitate + km, senza contributo e anticipazioni; chi è sostituto d'imposta
   tra i clienti di Manuel (aziende, condomini sì; privati no; clienti in regime forfettario?).
3. Bollo: soglia 77,47 € sulla sola parte N1, esclusi i tributi del cliente; se Manuel lo riaddebita al cliente
   (riga N1 da 2 €) o lo tiene a suo carico.
4. TD01 (fattura) o TD06 (parcella); causale della ritenuta `A`.
5. Manuel fattura subito o all'incasso (avviso di parcella prima)?
6. Regime fiscale RF01 e periodicità dell'IVA (mensile o trimestrale), per gli impegni in Tributi e F24.
7. Le ritenute sulle fatture ricevute da professionisti: codice 1040 entro il 16 del mese dopo il pagamento.
8. Fuori da questa fase: fatture alla pubblica amministrazione (EPPI 2%, scissione dei pagamenti, FPA12, CIG/CUP),
   clienti esteri, regime forfettario (previsto nei conti, mai provato con un caso vero).
