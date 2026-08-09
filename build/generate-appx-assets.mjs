// Generuje komplet grafik wymaganych przez pakiet MSIX/APPX (Sklep Microsoft).
// Wynik trafia do build/appx/ — stamtad czyta je electron-builder.
import { mkdirSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { renderLogoPng } from './lib/render.mjs'

const outDir = join(dirname(fileURLToPath(import.meta.url)), 'appx')
mkdirSync(outDir, { recursive: true })

const assets = [
  // nazwa pliku,            szerokosc, wysokosc, tryb
  ['StoreLogo.png', 50, 50, 'tile'],
  ['Square44x44Logo.png', 44, 44, 'tile'],
  ['SmallTile.png', 71, 71, 'tile'],
  ['Square150x150Logo.png', 150, 150, 'tile'],
  ['LargeTile.png', 310, 310, 'tile'],
  ['Wide310x150Logo.png', 310, 150, 'banner'],
  ['SplashScreen.png', 620, 300, 'banner']
]

for (const [name, width, height, mode] of assets) {
  const png = renderLogoPng({ width, height, mode })
  writeFileSync(join(outDir, name), png)
  console.log(`${name.padEnd(24)} ${width}x${height}  ${png.length} B`)
}

console.log(`\nGotowe — ${assets.length} plikow w ${outDir}`)
