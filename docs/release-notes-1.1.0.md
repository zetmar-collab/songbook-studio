# Songbook Studio 1.1.0 — notatki wydania

## Co nowego w tej wersji (Sklep, PL, limit 1500 znaków)
```
Duża aktualizacja: nowe funkcje i sporo poprawek.

NOWE
• Setlisty — kolejność utworów, osobna transpozycja każdego z nich, eksport PDF/DOCX/MD
• Tryb sceniczny — duża czcionka, autoprzewijanie, strzałkami po setliście
• Podgląd „akordy nad tekstem” i sugestia kapodastra
• Wybór tonacji docelowej przy transpozycji
• Zakładka Suno — tekst bez akordów z angielskimi tagami sekcji i pole stylu
• Automatyczne wersje przed AI, transpozycją i przywracaniem + przycisk Cofnij
• Porównanie wersji (różnice linia po linii)
• Import wielu plików naraz: .docx, .txt, ChordPro
• Eksport do ChordPro; akordy nad tekstem w PDF/DOCX/MD
• Pełna kopia zapasowa ZIP (baza + nagrania głosowe)
• Notatki głosowe: nazwa, opis, znaczniki czasu

POPRAWKI
• Wyszukiwanie ignoruje polskie znaki (także „ł”) i działa po fragmentach słów
• Edytor nie zmienia zakładki podczas zapisu i zapisuje zmiany przy zamknięciu
• Etykiety sekcji ([Refren]) nie są traktowane jak akordy
• Bezpieczniejsze przywracanie kopii i obsługa plików nagrań
• Mniejszy rozmiar instalatora
```

## What's new in this version (Store, EN, 1,500 characters max)
```
A big update: new features and many fixes.

NEW
• Setlists — song order, per-song transposition, PDF/DOCX/MD export
• Stage mode — big font, auto-scroll, arrow-key navigation through the setlist
• "Chords above lyrics" preview and capo suggestion
• Target-key picker when transposing
• Suno tab — chord-free lyrics with English section tags and a style field
• Automatic versions before AI, transposing and restoring, plus an Undo button
• Version comparison (line-by-line diff)
• Import several files at once: .docx, .txt, ChordPro
• ChordPro export; chords above lyrics in PDF/DOCX/MD
• Full ZIP backup (database + voice recordings)
• Voice notes: title, description, time markers

FIXES
• Search ignores Polish diacritics (including "ł") and matches inside words
• The editor no longer switches tabs while saving and saves changes on close
• Section labels ([Chorus]) are no longer treated as chords
• Safer backup restore and recording-file handling
• Smaller installer
```

## Dodatkowe cechy produktu (do dopisania w Partner Center)
```
Setlists with per-song transposition and export
Stage mode with auto-scroll for live playing
Suno AI helper: chord-free lyrics and style field
Automatic snapshots with Undo and a version diff view
Import .docx, .txt and ChordPro files in bulk; export to ChordPro
Full ZIP backup including voice recordings
```

## Procedura publikacji
1. `npm run ci` (typecheck, testy, build).
2. `npm run dist` — instalator NSIS i wersja portable w `dist/`; `npm run dist:store` — niepodpisany `.msix` dla Partner Center.
3. GitHub: tag `v1.1.0`, release z plikami `Songbook-Studio-1.1.0-x64.exe`, `latest.yml`, `.blockmap`, portable.
4. Partner Center: nowy submission → wgraj `Songbook-Studio-1.1.0-store.msix`, wklej powyższe notatki, ewentualnie nowe zrzuty ekranu.
