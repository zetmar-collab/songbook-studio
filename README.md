# 🎵 Songbook Studio

[![Sklep Microsoft](https://img.shields.io/badge/Sklep%20Microsoft-pobierz-0078D4?style=flat-square&logo=microsoftstore&logoColor=white)](https://apps.microsoft.com/store/detail/9MXMQXMV1D22)
[![Wydanie](https://img.shields.io/github/v/release/zetmar-collab/songbook-studio?label=GitHub&style=flat-square)](https://github.com/zetmar-collab/songbook-studio/releases/latest)
[![Platforma](https://img.shields.io/badge/platforma-Windows%20x64-0078D6?style=flat-square)](https://apps.microsoft.com/store/detail/9MXMQXMV1D22)
[![Licencja](https://img.shields.io/github/license/zetmar-collab/songbook-studio?style=flat-square)](LICENSE)

**🇵🇱 Polski** · **[🇬🇧 English](#-songbook-studio--english)**

Desktopowa aplikacja (Windows `.exe`) do organizowania **tekstów piosenek, akordów i pomysłów na utwory**. Działa **offline**, z opcjonalnym generowaniem akordów przez AI.

Zbudowana w **Electron + React + TypeScript + SQLite**.

## 📥 Instalacja (dla użytkowników)

### Zalecane: Sklep Microsoft

**➡️ [Pobierz Songbook Studio ze Sklepu Microsoft](https://apps.microsoft.com/store/detail/9MXMQXMV1D22)**

Instalacja jednym kliknięciem, bez ostrzeżeń SmartScreen, z automatycznymi aktualizacjami przez Sklep.

### Alternatywnie: instalator z GitHuba

1. Przejdź do **[najnowszego wydania](https://github.com/zetmar-collab/songbook-studio/releases/latest)**.
2. Pobierz plik z sekcji **Assets**:
   - **`Songbook-Studio-<wersja>-x64.exe`** — instalator (skróty w menu Start i na pulpicie, automatyczne aktualizacje), **lub**
   - **`Songbook-Studio-<wersja>-portable.exe`** — wersja przenośna, uruchamiana bez instalacji (np. z pendrive'a).
3. Uruchom pobrany plik. Przy pierwszym starcie Windows SmartScreen może pokazać ostrzeżenie (pliki z GitHuba nie są podpisane certyfikatem) — kliknij **„Więcej informacji" → „Uruchom mimo to"**. Wersja ze Sklepu tego problemu nie ma.

Po instalacji aplikacja działa offline. Aby korzystać z generowania akordów przez AI, wklej klucz API w **⚙️ Ustawienia** (OpenRouter lub Gemini) — jest przechowywany lokalnie i zaszyfrowany.

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

- `Songbook-Studio-<wersja>-x64.exe` — instalator NSIS (~82 MB)
- `Songbook-Studio-<wersja>-portable.exe` — wersja przenośna (bez instalacji)

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

### 1. Tożsamość pakietu

Nazwa jest już zarezerwowana w Partner Center, a wartości tożsamości wpisane na stałe
w [build/make-msix.mjs](build/make-msix.mjs) — zgodnie z **Product management → Product identity**:

| Pole | Wartość |
|---|---|
| Package/Identity/Name | `MarekZettel-zetmar.Songbook-Studio` |
| Package/Identity/Publisher | `CN=15A53D32-C868-48EE-B700-5DBB5449CA1B` |
| Package/Properties/PublisherDisplayName | `Marek Zettel - zetmar` |

Te wartości są jawne — trafiają do manifestu każdego opublikowanego pakietu.
W razie potrzeby (np. inne konto) nadpiszesz je zmiennymi `MSIX_IDENTITY_NAME`,
`MSIX_PUBLISHER`, `MSIX_PUBLISHER_DISPLAY`.

### 2. Zbuduj pakiet

```bash
npm run dist:store
```

Wynik: `dist/Songbook-Studio-<wersja>-store.msix` — gotowy do wysłania do Partner Center.
(`npm run icons` uruchamiaj tylko po zmianie grafiki logo.)

> 🔑 **Certyfikat jest darmowy** — pakiet wysyła się do Partner Center **niepodpisany**,
> a Microsoft podpisuje go samodzielnie w procesie certyfikacji. Nie kupujesz certyfikatu.

### 3. (Opcjonalnie) Test lokalny przed wysyłką

Aby zainstalować pakiet u siebie, trzeba go podpisać certyfikatem self-signed, którego
podmiot **musi dokładnie odpowiadać** polu `Publisher` w manifeście. Wymaga uprawnień administratora:

```powershell
# PowerShell jako administrator
$cert = New-SelfSignedCertificate -Type Custom -Subject "CN=15A53D32-C868-48EE-B700-5DBB5449CA1B" `
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

### Materiały do zgłoszenia

Wszystko, czego wymaga Partner Center, jest już przygotowane:

| Element | Gdzie |
|---|---|
| Polityka prywatności (URL) | [zetmar-collab.github.io/songbook-studio/privacy-policy.html](https://zetmar-collab.github.io/songbook-studio/privacy-policy.html) |
| Strona produktu (URL) | [zetmar-collab.github.io/songbook-studio](https://zetmar-collab.github.io/songbook-studio/) |
| Teksty listingu PL/EN, cechy, hasła wyszukiwania | [docs/store-listing.md](docs/store-listing.md) |
| Uzasadnienie dostępu do mikrofonu | [docs/store-listing.md](docs/store-listing.md) → *Deklaracje produktu* |
| Zrzuty ekranu (1584 × 903, wymóg: min. 1366 × 768) | [docs/screenshots/](docs/screenshots/) |

Źródła stron WWW leżą w `docs/` i są publikowane przez GitHub Pages
(Settings → Pages → Source: `main`, folder `/docs`).

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

- **Klucze API szyfrowane w spoczynku** — `safeStorage` Electrona (na Windows DPAPI, powiązane
  z kontem użytkownika). Klucz nie występuje jawnie w bazie ani w kopiach zapasowych
  ([src/main/secrets.ts](src/main/secrets.ts)); klucze zapisane przez starsze wersje są
  doszyfrowywane automatycznie przy starcie
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

### Recommended: Microsoft Store

**➡️ [Get Songbook Studio from the Microsoft Store](https://apps.microsoft.com/store/detail/9MXMQXMV1D22)**

One-click install, no SmartScreen warnings, automatic updates through the Store.

### Alternative: installer from GitHub

1. Go to the **[latest release](https://github.com/zetmar-collab/songbook-studio/releases/latest)**.
2. Under **Assets**, download one of:
   - **`Songbook-Studio-<version>-x64.exe`** — installer (Start‑menu & desktop shortcuts, automatic updates), **or**
   - **`Songbook-Studio-<version>-portable.exe`** — portable, runs without installation (e.g. from a USB stick).
3. Run the downloaded file. On first launch Windows SmartScreen may show a warning (the GitHub builds are not code‑signed) — click **"More info" → "Run anyway"**. The Store version does not have this issue.

After installation the app works offline. To use AI chord generation, paste an API key in **⚙️ Settings** (OpenRouter or Gemini) — it is stored locally and encrypted.

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
