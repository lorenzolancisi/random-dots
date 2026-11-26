# Random Dots — EconCult demo (lunedì 30/11/2026)

Web app per una demo dal vivo (≤ 7 minuti) su *wisdom of crowds* vs *collective intelligence*.
Requisiti: `PROJECT_BRIEF.md` (Progetto Claude). Decisioni vincolanti: `DECISIONI.md`. Stato reale: `STATO.md`.

## Stato (aggiornato 26/11/2026)
| Componente | Stato |
|---|---|
| `src/shared/stimulus.js` generatore stimolo (seed, conteggio esatto, no sovrapposizioni) | REALIZZATO, testato |
| `src/shared/analysis.js` formule (media, mediana, SD n-1, IQR type 7, errori, miglioramento, gruppi A/B) | REALIZZATO, testato |
| `tests/` 24 test (`npm test`), confronto numpy in `tests/fixtures/` (rigenerato e identico con numpy 2.5.3) | REALIZZATO |
| `local/candidates.json` + `preview/` — **RISERVATI**, esclusi da git (contengono i conteggi esatti) | REALIZZATO |
| `docs/check.html` pagina di verifica della connessione a Firebase (WP0) | REALIZZATO, da verificare online |
| `tests/publish-safety.test.js` nessun dato riservato nei file pubblici | REALIZZATO |
| Interfaccia partecipante, console facilitatore, Display, regole Firestore, CSV | PIANIFICATO |

## Comandi
- `npm install` poi `npm run build` — genera il sito in `docs/`
- `npm test` — tutti i test (Node 22, nessuna dipendenza). Senza `local/candidates.json` i test specifici dei candidati vengono saltati.
- `npm run previews` — rigenera `preview/` (richiede `local/candidates.json`)
- `python3 tools/make_numpy_fixture.py` — rigenera il riferimento numpy (non necessario per i test)

## Stimolo
Algoritmo `dart-throwing-min-distance/mulberry32/v1`, canvas logico 1600x900 (16:9), raggio 8, distanza minima tra centri 36, margine 40.
I seed e i conteggi dei 3 candidati sono in `local/candidates.json` (riservato). Il facilitatore inserisce seed e conteggio approvati alla creazione della sessione; il conteggio vive solo in un documento Firestore leggibile dal facilitatore.
Non modificare algoritmo o parametri: i test fissano gli hash dei punti per garantire la riproducibilità dal seed.

## Regola di pubblicazione
Il repository e il sito sono pubblici: **nessun conteggio, nessun seed approvato, nessuna email, nessuna regola Firestore** nei file versionati.
Il sito va in `docs/` (GitHub Pages); la documentazione di progetto va in `project-docs/` (per evitare il conflitto con `docs/`).
