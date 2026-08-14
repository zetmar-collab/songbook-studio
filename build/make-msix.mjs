// Buduje pakiet MSIX dla Sklepu Microsoft bezposrednio przez Windows SDK
// (makeappx + makepri), na podstawie katalogu dist/win-unpacked.
//
// Dlaczego nie cel `appx` z electron-buildera:
//  - wymaga paczki winCodeSign, ktorej rozpakowanie na Windows psuja symlinki macOS,
//  - jego szablon manifestu deklaruje tylko runFullTrust, a aplikacja nagrywa
//    notatki glosowe i potrzebuje <DeviceCapability Name="microphone"/>.
//
// Wartosci tozsamosci pakietu nadpiszesz zmiennymi srodowiskowymi (patrz README):
//   MSIX_IDENTITY_NAME, MSIX_PUBLISHER, MSIX_PUBLISHER_DISPLAY
import { execFileSync } from 'child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'

const ROOT = resolve('.')
const DIST = join(ROOT, 'dist')
const UNPACKED = join(DIST, 'win-unpacked')
const STAGING = join(DIST, 'msix-staging')
const ASSETS_SRC = join(ROOT, 'build', 'appx')

const pkgJson = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))

// --- Tozsamosc pakietu -------------------------------------------------------
// Wartosci zarezerwowane w Partner Center (Product management -> Product identity).
// Sa jawne — trafiaja do manifestu kazdego opublikowanego pakietu.
// W razie potrzeby mozna je nadpisac zmiennymi srodowiskowymi.
const IDENTITY_NAME = process.env.MSIX_IDENTITY_NAME || 'MarekZettel-zetmar.SongbookStudio'
const PUBLISHER = process.env.MSIX_PUBLISHER || 'CN=15A53D32-C868-48EE-B700-5DBB5449CA1B'
const PUBLISHER_DISPLAY = process.env.MSIX_PUBLISHER_DISPLAY || 'Marek Zettel - zetmar'

// UWAGA: musi byc DOKLADNIE jedna z nazw zarezerwowanych w Partner Center
// (Product management -> Manage app names). Sklep odrzuca pakiet, jesli
// Package/Properties/DisplayName nie odpowiada zadnej zarezerwowanej nazwie.
const DISPLAY_NAME = process.env.MSIX_DISPLAY_NAME || 'Songbook Studio'
const DESCRIPTION =
  'Organizuj teksty piosenek, akordy i pomysly na utwory. Dziala offline, z opcjonalnym generowaniem akordow przez AI.'
const EXECUTABLE = 'Songbook Studio.exe'
const APPLICATION_ID = 'SongbookStudio'
const BACKGROUND_COLOR = '#4361EE'
// Electron 33 wymaga Windows 10 1809 (10.0.17763) lub nowszego.
const MIN_VERSION = '10.0.17763.0'
const MAX_VERSION_TESTED = '10.0.26100.0'

/** Sklep wymaga wersji czteroczlonowej, w ktorej ostatni czlon (revision) to 0. */
function packageVersion(v) {
  const [major = '0', minor = '0', patch = '0'] = v.split('-')[0].split('.')
  return `${major}.${minor}.${patch}.0`
}

function findSdkTool(tool) {
  const roots = [
    'C:\\Program Files (x86)\\Windows Kits\\10\\bin',
    'C:\\Program Files\\Windows Kits\\10\\bin'
  ].filter(existsSync)

  const found = []
  for (const root of roots) {
    for (const ver of readdirSync(root)) {
      const p = join(root, ver, 'x64', tool)
      if (existsSync(p)) found.push({ ver, path: p })
    }
  }
  if (found.length === 0) {
    throw new Error(`Nie znaleziono ${tool}. Zainstaluj Windows 10/11 SDK.`)
  }
  found.sort((a, b) => b.ver.localeCompare(a.ver, undefined, { numeric: true }))
  return found[0].path
}

function xmlEscape(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildManifest(version) {
  // Publisher w apostrofach — wartosc zawiera przecinki i cudzyslowy w polach DN.
  return `<?xml version="1.0" encoding="utf-8"?>
<Package
  xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
  xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
  xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"
  IgnorableNamespaces="uap rescap">

  <Identity Name="${xmlEscape(IDENTITY_NAME)}"
            Publisher='${PUBLISHER}'
            Version="${version}"
            ProcessorArchitecture="x64" />

  <Properties>
    <DisplayName>${xmlEscape(DISPLAY_NAME)}</DisplayName>
    <PublisherDisplayName>${xmlEscape(PUBLISHER_DISPLAY)}</PublisherDisplayName>
    <Description>${xmlEscape(DESCRIPTION)}</Description>
    <Logo>assets\\StoreLogo.png</Logo>
  </Properties>

  <Resources>
    <Resource Language="pl-PL" />
    <Resource Language="en-US" />
  </Resources>

  <Dependencies>
    <TargetDeviceFamily Name="Windows.Desktop"
                        MinVersion="${MIN_VERSION}"
                        MaxVersionTested="${MAX_VERSION_TESTED}" />
  </Dependencies>

  <Capabilities>
    <rescap:Capability Name="runFullTrust" />
    <!-- Notatki glosowe: nagrywanie pomyslow na melodie -->
    <DeviceCapability Name="microphone" />
  </Capabilities>

  <Applications>
    <Application Id="${APPLICATION_ID}"
                 Executable="${xmlEscape(EXECUTABLE)}"
                 EntryPoint="Windows.FullTrustApplication">
      <uap:VisualElements
        DisplayName="${xmlEscape(DISPLAY_NAME)}"
        Description="${xmlEscape(DESCRIPTION)}"
        BackgroundColor="${BACKGROUND_COLOR}"
        Square150x150Logo="assets\\Square150x150Logo.png"
        Square44x44Logo="assets\\Square44x44Logo.png">
        <uap:DefaultTile
          ShortName="${xmlEscape(DISPLAY_NAME)}"
          Wide310x150Logo="assets\\Wide310x150Logo.png"
          Square310x310Logo="assets\\LargeTile.png"
          Square71x71Logo="assets\\SmallTile.png">
          <uap:ShowNameOnTiles>
            <uap:ShowOn Tile="square150x150Logo" />
            <uap:ShowOn Tile="wide310x150Logo" />
          </uap:ShowNameOnTiles>
        </uap:DefaultTile>
        <uap:SplashScreen Image="assets\\SplashScreen.png" BackgroundColor="${BACKGROUND_COLOR}" />
      </uap:VisualElements>
    </Application>
  </Applications>
</Package>
`
}

// --- Budowanie ---------------------------------------------------------------

if (!existsSync(UNPACKED)) {
  console.error(
    'Brak dist/win-unpacked. Uruchom najpierw:  npx electron-builder --win dir --publish never'
  )
  process.exit(1)
}

const version = packageVersion(pkgJson.version)
const makeappx = findSdkTool('makeappx.exe')
const outFile = join(DIST, `Songbook-Studio-${pkgJson.version}-store.msix`)

console.log(`Tozsamosc : ${IDENTITY_NAME}`)
console.log(`Wydawca   : ${PUBLISHER}`)
console.log(`Wersja    : ${version}`)
console.log(`makeappx  : ${makeappx}\n`)

console.log('1/4  przygotowanie katalogu pakietu…')
rmSync(STAGING, { recursive: true, force: true })
mkdirSync(STAGING, { recursive: true })
cpSync(UNPACKED, STAGING, { recursive: true })
cpSync(ASSETS_SRC, join(STAGING, 'assets'), { recursive: true })

console.log('2/4  zapis AppxManifest.xml…')
writeFileSync(join(STAGING, 'AppxManifest.xml'), buildManifest(version), 'utf8')
// Znacznik wykrywany przez src/main/updater.ts — wersja sklepowa nie aktualizuje sie sama.
writeFileSync(join(STAGING, 'resources', 'store-build'), '', 'utf8')

console.log('3/4  generowanie resources.pri…')
try {
  const makepri = findSdkTool('makepri.exe')
  const priConfig = join(DIST, 'priconfig.xml')
  execFileSync(makepri, ['createconfig', '/cf', priConfig, '/dq', 'pl-PL', '/o'], { stdio: 'pipe' })
  execFileSync(
    makepri,
    [
      'new',
      '/pr', STAGING,
      '/cf', priConfig,
      '/of', join(STAGING, 'resources.pri'),
      '/mn', join(STAGING, 'AppxManifest.xml'),
      '/o'
    ],
    { stdio: 'pipe' }
  )
  rmSync(priConfig, { force: true })
  console.log('     resources.pri utworzony')
} catch (e) {
  // Aplikacja nie uzywa odwolan ms-resource:, wiec brak PRI nie blokuje dzialania.
  console.warn('     pominieto PRI:', (e.stderr?.toString() || e.message).trim().split('\n')[0])
}

console.log('4/4  pakowanie MSIX…')
try {
  // makeappx waliduje manifest wzgledem schematu MSIX — blad tutaj oznacza zly manifest.
  execFileSync(makeappx, ['pack', '/d', STAGING, '/p', outFile, '/o'], { stdio: 'pipe' })
} catch (e) {
  console.error('\nBLAD pakowania:\n' + (e.stdout?.toString() || e.stderr?.toString() || e.message))
  process.exit(1)
}

rmSync(STAGING, { recursive: true, force: true })

const sizeMb = (readFileSync(outFile).length / 1024 / 1024).toFixed(1)
console.log(`\nGotowe: ${outFile}  (${sizeMb} MB)`)
console.log('Pakiet jest NIEPODPISANY — wlasnie taki wysyla sie do Partner Center.')
console.log('Do testu lokalnego podpisz go certyfikatem self-signed (patrz README).')
