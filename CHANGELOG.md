# Changelog

## 2026-11-26 sera — prova completa e correzioni (Opus 5.5)
- Prova completa a schermo (console + Display + 2 partecipanti simulati) su una sessione di prova poi cancellata: tutte le fasi ok, numeri dei risultati ricontrollati a mano.
- Corretto: la console rifiutava il facilitatore (id Firestore `__probe__` riservato) → `probe`.
- Corretto: messaggio di validazione nativo del browser (nella lingua del telefono) nel campo numerico → solo il messaggio inglese dell'app (`novalidate`).
- Corretto: "Group X" ripetuto sul telefono del portavoce dopo l'invio.
- Nuovo: la pagina partecipante non fa entrare un browser già collegato come facilitatore (invita a usare un altro telefono o una finestra in incognito).
- Numero di versione sugli script (cache di 10 minuti di GitHub Pages).
- Nuovi documenti: `project-docs/TEST_PLAN.md`, `project-docs/FACILITATOR_GUIDE.md` (bozza).

## 2026-11-26 — WP0 (Opus 5.5)
- Primo push su GitHub (`lorenzolancisi/random-dots`). Il sito sta in `docs/`, generato con `npm run build`.
- `src/shared/firebase-config.js`: configurazione del progetto Firebase `ci-presentation-87e9f` (Firestore eur3). Non è un segreto; senza `measurementId`: l'app non carica Google Analytics.
- `tools/build.js` (esbuild): integra nel sito il SDK Firebase 13.4.0 e la libreria QR, nessun CDN necessario all'evento.
- `src/pages/check.html` + `src/app/check.js`: pagina di verifica (inizializzazione, accesso anonimo, raggiungibilità di Firestore). Non scrive dati.
- `tests/publish-safety.test.js`: blocca seed, conteggi, email del facilitatore e regole Firestore nei file pubblici. Al primo giro ha trovato un conteggio citato in questo CHANGELOG: rimosso.
- `local/facilitator.txt` (riservato, escluso da git): email del facilitatore per generare le regole.

## 2026-11-25 — revisione (Opus 5.5)
Verifica: tutti i file presenti; `npm test` 24/24; anteprime con punti identici a quelli rigenerati dal seed; fixture numpy rigenerata e identica.
Nota: gli SVG in `preview/` salvati su Windows contengono un blocco `<metadata>` C2PA (credenziali di contenuto aggiunte dal trasferimento file). Innocuo: i punti sono identici.

Modifiche (nessuna modifica a algoritmo, parametri, formule o risultati):
1. **Conteggi esatti tolti dal codice pubblicabile.** `CANDIDATES` (seed + conteggi) e gli hash fissati spostati da `src/shared/stimulus.js` e `tests/stimulus.test.js` a `local/candidates.json`, escluso da git. Motivo: repository GitHub Pages pubblico e `stimulus.js` incluso nel sito → chiunque avrebbe potuto leggere la risposta. (D-14)
2. **Nuovo `tools/candidates.js`**: caricatore Node del file riservato; test e `make-previews` lo usano; se il file manca i test dei candidati sono saltati, non falliti.
3. **Nuovo `.gitignore`**: esclude `local/`, `preview/`, `node_modules/`.
4. **Commenti** in `stimulus.js` e `analysis.js`: riferimenti spostati da "PIANO_OPERATIVO decisione 8/9" a `DECISIONI.md` D-12/D-13.
5. **README** riscritto: stato verificato, regola di pubblicazione, `docs/` (sito) vs `project-docs/` (documentazione).
6. **`tests/analysis.test.js`**: il valore vero di prova coincideva con il conteggio di un candidato (indizio in un file pubblico). Sostituito con 197 e valori attesi ricalcolati a mano; stesse verifiche, nessuna modifica alle formule.
