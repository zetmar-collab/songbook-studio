# 🎵 Songbook Studio

[![Wydanie](https://img.shields.io/github/v/release/zetmar-collab/songbook-studio?label=pobierz&style=flat-square)](https://github.com/zetmar-collab/songbook-studio/releases/latest)
[![Platforma](https://img.shields.io/badge/platforma-Windows%20x64-0078D6?style=flat-square)](https://github.com/zetmar-collab/songbook-studio/releases/latest)
[![Licencja](https://img.shields.io/github/license/zetmar-collab/songbook-studio?style=flat-square)](LICENSE)

**🇵🇱 Polski** · **[🇬🇧 English](#-songbook-studio--english)**

Desktopowa aplikacja (Windows `.exe`) do organizowania **tekstów piosenek, akordów i pomysłów na utwory**. Działa **offline**, z opcjonalnym generowaniem akordów przez AI.

Zbudowana w **Electron + React + TypeScript + SQLite**.

## 📥 Instalacja (dla użytkowników)

1. Przejdź do **[najnowszego wydania](https://github.com/zetmar-collab/songbook-studio/releases/latest)**.
2. Pobierz plik z sekcji **Assets**:
   - **`Songbook-Studio-1.0.0-x64.exe`** — instalator (zalecane: skróty w menu Start i na pulpicie, automatyczne aktualizacje), **lub**
   - **`Songbook-Studio-1.0.0-portable.exe`** — wersja przenośna, uruchamiana bez instalacji (np. z pendrive'a).
3. Uruchom pobrany plik. Przy pierwszym starcie Windows SmartScreen może pokazać ostrzeżenie (aplikacja nie jest podpisana certyfikatem) — kliknij **„Więcej informacji" → „Uruchom mimo to"**.
4. Gotowe! Aplikacja działa offline. Aby korzystać z generowania akordów przez AI, wklej klucz API w **⚙️ Ustawienia** (OpenRouter lub Gemini) — jest przechowywany tylko lokalnie.

> 💡 Programiści i osoby chcące zbudować aplikację ze źródeł — instrukcje poniżej w sekcji *Uruchomienie w trybie deweloperskim*.

## Zrzuty ekranu

| Motyw jasny | Motyw ciemny |
|:---:|:---:|
| ![Songbook Studio — motyw jasny](docs/screenshots/main-light.png) | ![Songbook Studio — motyw ciemny](docs/screenshots/main-dark.png) |

## Funkcje

- 📚 **Katalog utworów** — tytuł, wykonawca, tonacja, tagi, ulubione
- 🕘 **Wersjonowanie tekstów** — zapisuj migawki i przywracaj wcześniejsze wersje
- 🎙 **Notatki głosowe** — nagrywaj pomysły na melodię prosto w aplikacji
- ✨ **Automatyczne akordy z AI** — OpenRouter lub Google Gemini
- 🆓 **Lista darmowych modeli OpenRouter** — po wklejeniu klucza API pobierana automatycznie do wyboru z listy
- 🎚 **Transpozycja akordów** — przyciski ♭−1 / ♯+1 transponują akordy w nawiasach `[ ]` i tonację
- 📥 **Import z Worda (.docx)** — wczytaj istniejący tekst jako nowy utwór (bez zewnętrznych zależności)
- 📄 **Eksport do PDF, DOCX i Markdown** (pojedynczy utwór)
- 📖 **Eksport zbiorczy** — cały śpiewnik do jednego PDF/DOCX/MD (okładka + spis treści)
- ⬆ **Automatyczne aktualizacje** (electron-updater)
- 🔍 **Wyszukiwanie pełnotekstowe** (SQLite FTS5) po tytule, tekście i akordach — także bez polskich znaków diakrytycznych
- 💾 **Kopie zapasowe bazy** — ręczne (utwórz / przywróć) oraz automatyczne przy zamknięciu (10 ostatnich)
- 🌗 **Jasny / ciemny / systemowy motyw**
- 🌍 **Język PL / EN**

## Wymagania

- Node.js 18+ (zalecane 20+)
- Windows (build produkcyjny celuje w Windows x64)

## Uruchomienie w trybie deweloperskim

```bash
npm install
npm run dev
```

> Przy pierwszym `npm install` uruchamiany jest `electron-builder install-app-deps`,
> który kompiluje natywny moduł `better-sqlite3` pod używaną wersję Electrona.

## Budowanie pliku .exe

```bash
# Instalator NSIS + wersja portable (x64)
npm run dist

# Tylko wersja portable
npm run dist:portable
```

Gotowe pliki znajdziesz w katalogu `dist/`:

- `Songbook Studio-1.0.0-x64.exe` — instalator NSIS (~82 MB)
- `Songbook Studio-1.0.0-portable.exe` — wersja przenośna (bez instalacji)

> ⚠️ Instalator nie jest podpisany certyfikatem. Przy pierwszym uruchomieniu
> Windows SmartScreen może pokazać ostrzeżenie — kliknij „Więcej informacji" →
> „Uruchom mimo to". Aby usunąć ostrzeżenie na stałe, potrzebny jest certyfikat
> podpisywania kodu (Code Signing Certificate).

## Konfiguracja AI

Klucze API wpisujesz w aplikacji: **⚙️ Ustawienia → Dostawca AI**.
Są przechowywane lokalnie (baza SQLite w katalogu danych użytkownika) i nigdy nie opuszczają Twojego komputera poza wywołaniem wybranego dostawcy.

- **OpenRouter** — klucz z https://openrouter.ai/keys (domyślny model: `google/gemini-2.0-flash-exp:free`)
- **Gemini** — klucz z https://aistudio.google.com/app/apikey (domyślny model: `gemini-2.0-flash`)

## Publikacja w Sklepie Microsoft (MSIX)

Pakiet sklepowy budowany jest **bezpośrednio przez Windows SDK** (`makeappx` + `makepri`),
skryptem [build/make-msix.mjs](build/make-msix.mjs) — nie przez cel `appx` electron-buildera.
Powody: cel `appx` wymaga paczki `winCodeSign`, której rozpakowanie psują symlinki macOS,
a jego szablon manifestu nie pozwala zadeklarować mikrofonu (potrzebnego do notatek głosowych).

### Wymagania

- Windows 10/11 SDK (komponent *MSIX Packaging Tools*) — dostarcza `makeappx.exe` i `makepri.exe`
- Konto w [Partner Center](https://partner.microsoft.com/dashboard) (jednorazowa opłata rejestracyjna)

### 1. Zarezerwuj nazwę w Partner Center

W Partner Center utwórz nową aplikację i zarezerwuj nazwę. Następnie w
**Product management → Product identity** odczytaj trzy wartości:

| Wartość w Partner Center | Odpowiednik w skrypcie |
|---|---|
| Package/Identity/Name (np. `12345MarekZettel.SongbookStudio`) | `MSIX_IDENTITY_NAME` |
| Package/Identity/Publisher (np. `CN=ABCD1234-…`) | `MSIX_PUBLISHER` |
| Package/Properties/PublisherDisplayName | `MSIX_PUBLISHER_DISPLAY` |

### 2. Zbuduj pakiet

```bash
npm run icons
npm run dist:store
```

Domyślne wartości tożsamości służą tylko testom lokalnym. Do wydania sklepowego podaj swoje:

```bash
$env:MSIX_IDENTITY_NAME="12345MarekZettel.SongbookStudio"; $env:MSIX_PUBLISHER="CN=ABCD1234-..."; $env:MSIX_PUBLISHER_DISPLAY="Marek Zettel"; npm run dist:store
```

Wynik: `dist/Songbook-Studio-1.0.0-store.msix`.

> 🔑 **Certyfikat jest darmowy** — pakiet wysyła się do Partner Center **niepodpisany**,
> a Microsoft podpisuje go samodzielnie w procesie certyfikacji. Nie kupujesz certyfikatu.

### 3. (Opcjonalnie) Test lokalny przed wysyłką

Aby zainstalować pakiet u siebie, trzeba go podpisać certyfikatem self-signed, którego
podmiot **musi dokładnie odpowiadać** polu `Publisher` w manifeście. Wymaga uprawnień administratora:

```powershell
# PowerShell jako administrator
$cert = New-SelfSignedCertificate -Type Custom -Subject "CN=Marek Zettel" `
  -KeyUsage DigitalSignature -CertStoreLocation "Cert:\CurrentUser\My" `
  -TextExtension @("2.5.29.37={text}1.3.6.1.5.5.7.3.3","2.5.29.19={text}")
Export-PfxCertificate -Cert $cert -FilePath test.pfx -Password (ConvertTo-SecureString -String "test" -Force -AsPlainText)
Import-Certificate -FilePath (Export-Certificate -Cert $cert -FilePath test.cer) -CertStoreLocation Cert:\LocalMachine\TrustedPeople

& "${env:ProgramFiles(x86)}\Windows Kits\10\bin\10.0.26100.0\x64\signtool.exe" sign `
  /fd SHA256 /f test.pfx /p test "dist\Songbook-Studio-1.0.0-store.msix"

Add-AppxPackage "dist\Songbook-Studio-1.0.0-store.msix"
```

Pakiet wysyłany do Sklepu musi być **niepodpisany** — przed wysyłką zbuduj go ponownie.

### Co pakiet już zawiera

- ✅ `<DeviceCapability Name="microphone"/>` — bez tego notatki głosowe nie działają w kontenerze MSIX
- ✅ `runFullTrust` (aplikacja desktopowa Win32)
- ✅ Wersja czteroczłonowa `1.0.0.0` — Sklep wymaga, by ostatni człon był zerem
- ✅ Komplet kafelków i splash screen (generowane przez `npm run icons`)
- ✅ `resources.pri` z deklaracją języków pl-PL / en-US
- ✅ Wyłączone auto-aktualizacje — Sklep aktualizuje aplikację samodzielnie (wymóg polityk Store)

### O czym pamiętać przy zgłoszeniu

- **Polityka prywatności** — Sklep jej wymaga, bo aplikacja może wysyłać teksty do zewnętrznego
  dostawcy AI (OpenRouter/Gemini), gdy użytkownik wprowadzi klucz API. Opisz, że dzieje się to
  wyłącznie na żądanie użytkownika, a klucz i dane pozostają lokalnie.
- **Uzasadnienie mikrofonu** — w formularzu zgłoszenia opisz, że służy do nagrywania notatek głosowych.
- **Zrzuty ekranu** — możesz użyć tych z `docs/screenshots/`.

## Automatyczne aktualizacje

Aplikacja używa **electron-updater**. Po starcie (tylko w wersji zainstalowanej)
sprawdza serwer aktualizacji; nową wersję pobiera w tle, a po jej pobraniu pokazuje
baner „Uruchom ponownie, aby zainstalować". Ręcznie: ⚙️ Ustawienia → Aktualizacje →
„Sprawdź aktualizacje".

Aby aktualizacje działały, ustaw provider w [electron-builder.yml](electron-builder.yml)
(`publish:`) i publikuj nowe wydania:

**Wariant A — własny hosting (generic):**

```yaml
publish:
  provider: generic
  url: https://twoj-serwer.pl/songbook-updates/
```

Po `npm run dist` wgraj na ten adres pliki z `dist/`: instalator `.exe`,
`latest.yml` oraz `*.blockmap`. Podbij `version` w `package.json` przy każdym wydaniu.

**Wariant B — GitHub Releases:**

```yaml
publish:
  provider: github
  owner: twoj-login
  repo: songbook-studio
```

Publikuj: `npx electron-builder --win --publish always` (wymaga `GH_TOKEN`).

> Bez skonfigurowanego serwera aplikacja działa normalnie — sprawdzanie aktualizacji
> po prostu nic nie znajdzie (błędy są wyciszane).

## Gdzie trzymane są dane?

Wszystko lokalnie, w katalogu danych aplikacji:

- `songbook.db` — baza SQLite (utwory, wersje, ustawienia)
- `voice-notes/` — pliki nagrań `.webm`

Ścieżka: `%APPDATA%\songbook-studio\` (Windows).

## Architektura

```
src/
  main/        Proces główny Electrona (Node)
    db.ts        SQLite + FTS5, CRUD, wersje, notatki, ustawienia
    ai.ts        Integracja OpenRouter / Gemini
    export.ts    Eksport PDF (printToPDF) / DOCX (docx) / Markdown
    ipc.ts       Handlery IPC
    index.ts     Okno, motyw
  preload/     Bezpieczny most contextBridge (contextIsolation ON)
  renderer/    UI React + i18next + motywy CSS
```

## Rozwiązywanie problemów

### `npm install` zawodzi na `better-sqlite3` (gyp / MSBuild)

`better-sqlite3` to moduł natywny. Jeśli na komputerze nie ma pełnego toolchainu
C++ (Visual Studio Build Tools z „Desktop development with C++"), kompilacja ze
źródeł się nie powiedzie. Nie trzeba kompilować — wystarczy pobrać gotowy binarny
build dla używanej wersji Electrona:

```bash
# 1. Zainstaluj zależności bez uruchamiania skryptów build
npm install --ignore-scripts

# 2. Pobierz binaria Electrona (postinstall został pominięty)
node node_modules/electron/install.js

# 3. Pobierz gotowy build better-sqlite3 dla Twojej wersji Electrona
#    (sprawdź wersję: node -p "require('./node_modules/electron/package.json').version")
cd node_modules/better-sqlite3
npx prebuild-install -r electron -t 33.4.11 --arch x64
cd ../..
```

Alternatywnie zainstaluj **Visual Studio Build Tools** (workload „Desktop
development with C++") i wtedy zwykłe `npm install` skompiluje moduł samodzielnie.

## Bezpieczeństwo

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox` z preloadem
- Renderer komunikuje się z systemem tylko przez zdefiniowane kanały IPC
- Ścisła Content-Security-Policy w `index.html`
- Zewnętrzne linki otwierane w domyślnej przeglądarce, nie w oknie aplikacji

## Licencja

[MIT](LICENSE) © 2026 Marek

---

# 🎵 Songbook Studio — English

**[🇵🇱 Polski](#-songbook-studio)** · **🇬🇧 English**

A desktop app (Windows `.exe`) for organizing **song lyrics, chords and songwriting ideas**. Works **offline**, with optional AI chord generation.

Built with **Electron + React + TypeScript + SQLite**.

## 📥 Installation (for users)

1. Go to the **[latest release](https://github.com/zetmar-collab/songbook-studio/releases/latest)**.
2. Under **Assets**, download one of:
   - **`Songbook-Studio-1.0.0-x64.exe`** — installer (recommended: Start‑menu & desktop shortcuts, automatic updates), **or**
   - **`Songbook-Studio-1.0.0-portable.exe`** — portable, runs without installation (e.g. from a USB stick).
3. Run the downloaded file. On first launch Windows SmartScreen may show a warning (the app isn't code‑signed) — click **"More info" → "Run anyway"**.
4. Done! The app works offline. To use AI chord generation, paste an API key in **⚙️ Settings** (OpenRouter or Gemini) — it is stored locally only.

## ✨ Features

- 📚 **Song catalog** — title, artist, key, tags, favorites
- 🕘 **Lyrics versioning** — save snapshots and restore earlier versions
- 🎙 **Voice notes** — record melody ideas right in the app
- ✨ **AI chord generation** — OpenRouter or Google Gemini
- 🆓 **Free OpenRouter models** — auto-fetched (with context limits) once you paste an API key
- 🎚 **Chord transposition** — ♭−1 / ♯+1 transposes bracketed `[ ]` chords and the key
- 📥 **Import from Word (.docx)** — load existing lyrics as a new song
- 📄 **Export to PDF, DOCX and Markdown** (single song)
- 📖 **Bulk export** — the whole songbook into one PDF/DOCX/MD (cover + table of contents)
- ⬆ **Automatic updates** (electron-updater)
- 🔍 **Full-text search** (SQLite FTS5), diacritics-insensitive
- 💾 **Database backups** — manual (create / restore, custom folder) and automatic on close
- 🌗 **Light / dark / system theme** · 🌍 **Polish / English UI**

## Build from source

```bash
npm install
npm run dev        # development
npm run dist       # build the Windows installer (output in dist/)
```

> If `npm install` fails on the native `better-sqlite3` module (no C++ toolchain),
> see the Polish *Rozwiązywanie problemów* section above for the prebuilt-binary workaround.

## Where is data stored?

Everything is local, in the app data directory (`%APPDATA%\songbook-studio\` on Windows):
the SQLite database (songs, versions, settings) and voice-note `.webm` files. API keys never
leave your computer except when calling your chosen AI provider.

## License

[MIT](LICENSE) © 2026 Marek
