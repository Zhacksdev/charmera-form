// Render the Figma-exported SVGs in assets/ into lightweight WebP files for the web.
// The SVGs embed multi-megabyte base64 PNGs, so serving them directly would make the page huge.
//
// Usage: node scripts/export-assets.mjs
// Output: public/assets/*.webp, public/charms/catalog-XX.webp, src/lib/charm-catalog.generated.ts
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..')
const SRC = path.join(ROOT, 'assets')
const OUT = path.join(ROOT, 'public', 'assets')
const CHARMS_OUT = path.join(ROOT, 'public', 'charms')

// [source svg, output name, scale relative to the SVG viewport]
const ILLUSTRATIONS = [
  ['logo.svg', 'logo.webp', 2],
  ['maskot-page.svg', 'maskot-page.webp', 2],
  ['maskot-set.svg', 'maskot-set.webp', 3],
  ['maskot-thx.svg', 'maskot-thx.webp', 1.5],
]

function render(file, scale) {
  return sharp(path.join(SRC, file), { density: 72 * scale, unlimited: true, limitInputPixels: false })
}

// Make the white background transparent, but only where it touches the image edge,
// so white highlights inside the drawing (eyes, glass) stay opaque.
async function cutOutWhite(file, maxWidth) {
  const { data, info } = await sharp(path.join(SRC, file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width, height } = info
  const lightness = (i) => Math.min(data[i * 4], data[i * 4 + 1], data[i * 4 + 2])
  const background = new Uint8Array(width * height)
  const stack = []
  for (let x = 0; x < width; x++) stack.push(x, (height - 1) * width + x)
  for (let y = 0; y < height; y++) stack.push(y * width, y * width + width - 1)
  while (stack.length) {
    const i = stack.pop()
    if (background[i] || lightness(i) < 236) continue
    background[i] = 1
    const x = i % width
    if (x > 0) stack.push(i - 1)
    if (x < width - 1) stack.push(i + 1)
    if (i >= width) stack.push(i - width)
    if (i < width * (height - 1)) stack.push(i + width)
  }
  for (let i = 0; i < width * height; i++) {
    if (background[i]) {
      data[i * 4 + 3] = 0
      continue
    }
    // Soften the anti-aliased rim next to the removed background.
    const x = i % width
    const touches = (x > 0 && background[i - 1]) || (x < width - 1 && background[i + 1]) ||
      (i >= width && background[i - width]) || (i < width * (height - 1) && background[i + width])
    if (touches) data[i * 4 + 3] = Math.max(0, Math.min(255, (255 - lightness(i)) * 6))
  }
  const cut = await sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer()
  return sharp(cut).trim({ threshold: 1 }).resize({ width: maxWidth, withoutEnlargement: true })
}

async function exportIllustrations() {
  fs.mkdirSync(OUT, { recursive: true })
  for (const [file, name, scale] of ILLUSTRATIONS) {
    const out = path.join(OUT, name)
    // A raster with the same base name (e.g. assets/maskot-page.webp) replaces the Figma SVG.
    const raster = ['.webp', '.png'].map(ext => file.replace(/\.svg$/, ext)).find(f => fs.existsSync(path.join(SRC, f)))
    const source = raster ?? file
    const image = raster ? await cutOutWhite(raster, 900) : render(file, scale)
    const info = await image.webp({ quality: 88, alphaQuality: 100 }).toFile(out)
    console.log(`${source} -> public/assets/${name} (${info.width}x${info.height}, ${Math.round(info.size / 1024)} KB)`)
  }
}

// Find runs of "ink" along one axis. `ink[i]` is how many pixels in row/column i differ from the background.
function findRuns(ink, minInk, minGap) {
  const runs = []
  let start = -1
  let gap = 0
  for (let i = 0; i < ink.length; i++) {
    if (ink[i] >= minInk) {
      if (start < 0) start = i
      gap = 0
    } else if (start >= 0) {
      gap++
      if (gap >= minGap) {
        runs.push([start, i - gap + 1])
        start = -1
        gap = 0
      }
    }
  }
  if (start >= 0) runs.push([start, ink.length - gap])
  return runs.filter(([a, b]) => b - a > 8)
}

async function exportCharmCatalog() {
  fs.mkdirSync(CHARMS_OUT, { recursive: true })
  const base = render('ctl-charm.svg', 1).ensureAlpha()
  const { data, info } = await base.clone().raw().toBuffer({ resolveWithObject: true })
  const { width, height, channels } = info
  const px = (x, y) => (y * width + x) * channels
  const bg = data.subarray(px(1, 1), px(1, 1) + 4)
  const differs = (o) =>
    Math.abs(data[o + 3] - bg[3]) > 40 ||
    (data[o + 3] > 40 && Math.abs(data[o] - bg[0]) + Math.abs(data[o + 1] - bg[1]) + Math.abs(data[o + 2] - bg[2]) > 60)

  const colInk = new Array(width).fill(0)
  const rowInk = new Array(height).fill(0)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (differs(px(x, y))) {
        colInk[x]++
        rowInk[y]++
      }
    }
  }
  const cols = findRuns(colInk, height * 0.04, 4)
  const rows = findRuns(rowInk, width * 0.04, 4)
  console.log(`catalog: ${width}x${height}, ${cols.length} columns, ${rows.length} rows`)
  if (cols.length === 0 || rows.length === 0) throw new Error('Could not detect the charm grid in ctl-charm.svg')

  const png = await base.png().toBuffer()
  const tileW = Math.max(...cols.map(([a, b]) => b - a))
  const tileH = Math.max(...rows.map(([a, b]) => b - a))
  let n = 0
  for (const [top, bottom] of rows) {
    for (const [left, right] of cols) {
      n++
      // Centre every tile in a box of the same size so all charms line up.
      const cx = Math.round((left + right) / 2)
      const cy = Math.round((top + bottom) / 2)
      const region = {
        left: Math.max(0, cx - Math.ceil(tileW / 2)),
        top: Math.max(0, cy - Math.ceil(tileH / 2)),
        width: Math.min(tileW, width - Math.max(0, cx - Math.ceil(tileW / 2))),
        height: Math.min(tileH, height - Math.max(0, cy - Math.ceil(tileH / 2))),
      }
      await sharp(png).extract(region).webp({ quality: 90 }).toFile(path.join(CHARMS_OUT, `catalog-${String(n).padStart(2, '0')}.webp`))
    }
  }

  const generated = `// Generated by scripts/export-assets.mjs. Do not edit by hand.
export const CHARM_CATALOG_COUNT = ${n}
export const CHARM_TILE_WIDTH = ${tileW}
export const CHARM_TILE_HEIGHT = ${tileH}
`
  fs.writeFileSync(path.join(ROOT, 'src', 'lib', 'charm-catalog.generated.ts'), generated)
  console.log(`catalog: wrote ${n} tiles (${tileW}x${tileH}) to public/charms/`)
}

await exportIllustrations()
await exportCharmCatalog()
