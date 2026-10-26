import type { KeychainShape, SidePhoto } from './order'
import { CHARM_TILE_HEIGHT, CHARM_TILE_WIDTH } from './charm-catalog.generated'

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

// Preview geometry, in the units of the preview SVG viewBox.
export const KEYCHAIN_VIEWBOX = { w: 300, h: 340 }
export const KEYCHAIN_RING = { cx: 150, cy: 34, r: 24 }

function roundedRect({ x, y, w, h }: Box, r: number) {
  return `M${x + r} ${y} H${x + w - r} Q${x + w} ${y} ${x + w} ${y + r} V${y + h - r} Q${x + w} ${y + h} ${x + w - r} ${y + h} H${x + r} Q${x} ${y + h} ${x} ${y + h - r} V${y + r} Q${x} ${y} ${x + r} ${y} Z`
}

function heart({ x, y, w, h }: Box) {
  const px = (v: number) => (x + (v / 230) * w).toFixed(2)
  const py = (v: number) => (y + (v / 216) * h).toFixed(2)
  return `M${px(115)} ${py(216)} C${px(45)} ${py(160)} ${px(0)} ${py(120)} ${px(0)} ${py(66)} C${px(0)} ${py(28)} ${px(28)} ${py(0)} ${px(64)} ${py(0)} C${px(88)} ${py(0)} ${px(106)} ${py(13)} ${px(115)} ${py(32)} C${px(124)} ${py(13)} ${px(142)} ${py(0)} ${px(166)} ${py(0)} C${px(202)} ${py(0)} ${px(230)} ${py(28)} ${px(230)} ${py(66)} C${px(230)} ${py(120)} ${px(185)} ${py(160)} ${px(115)} ${py(216)} Z`
}

const RECT_BOX: Box = { x: 66, y: 68, w: 168, h: 224 }
const SQUARE_BOX: Box = { x: 50, y: 82, w: 200, h: 200 }
const HEART_BOX: Box = { x: 36, y: 74, w: 228, h: 214 }

// `top` is where the ring's connector meets the shape.
export const KEYCHAIN_SHAPES: Record<KeychainShape, { box: Box; path: string; top: number }> = {
  rect: { box: RECT_BOX, path: roundedRect(RECT_BOX, 8), top: RECT_BOX.y },
  square: { box: SQUARE_BOX, path: roundedRect(SQUARE_BOX, 8), top: SQUARE_BOX.y },
  heart: { box: HEART_BOX, path: heart(HEART_BOX), top: HEART_BOX.y + (32 / 216) * HEART_BOX.h },
}

export const MAX_ZOOM = 3

function coverScale(box: Box, photo: Pick<SidePhoto, 'width' | 'height'>) {
  return Math.max(box.w / photo.width, box.h / photo.height)
}

// Keep the photo covering the whole shape while panning.
export function clampOffset(box: Box, photo: SidePhoto, dx: number, dy: number) {
  const scale = coverScale(box, photo) * photo.zoom
  const maxDx = (photo.width * scale - box.w) / 2
  const maxDy = (photo.height * scale - box.h) / 2
  return {
    dx: Math.max(-maxDx, Math.min(maxDx, dx)),
    dy: Math.max(-maxDy, Math.min(maxDy, dy)),
  }
}

export function photoPlacement(box: Box, photo: SidePhoto) {
  const scale = coverScale(box, photo) * photo.zoom
  const w = photo.width * scale
  const h = photo.height * scale
  const { dx, dy } = clampOffset(box, photo, photo.dx, photo.dy)
  return { x: box.x + (box.w - w) / 2 + dx, y: box.y + (box.h - h) / 2 + dy, w, h }
}

export function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Foto tidak bisa dibaca'))
    img.src = src
  })
}

// The photo window of an Italian charm link, matching `.link-frame` padding (9% 8% of the tile width).
export const CHARM_WINDOW: Box = {
  x: 0,
  y: 0,
  w: CHARM_TILE_WIDTH * 0.84,
  h: CHARM_TILE_HEIGHT - CHARM_TILE_WIDTH * 0.18,
}

export function newSidePhoto(file: File, src: string, img: HTMLImageElement): SidePhoto {
  return { file, src, width: img.naturalWidth, height: img.naturalHeight, zoom: 1, dx: 0, dy: 0 }
}

// Render exactly what the customer sees inside the shape, at print resolution.
export function renderKeychainSide(shape: KeychainShape, photo: SidePhoto, outputWidth = 1200) {
  const { box, path } = KEYCHAIN_SHAPES[shape]
  return renderPhoto(box, photo, outputWidth, path)
}

export function renderCharmPhoto(photo: SidePhoto, outputWidth = 800) {
  return renderPhoto(CHARM_WINDOW, photo, outputWidth)
}

async function renderPhoto(box: Box, photo: SidePhoto, outputWidth: number, path?: string) {
  const k = outputWidth / box.w
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(box.w * k)
  canvas.height = Math.round(box.h * k)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Browser tidak mendukung canvas')
  const img = await loadImage(photo.src)
  ctx.scale(k, k)
  ctx.translate(-box.x, -box.y)
  if (path) ctx.clip(new Path2D(path))
  const p = photoPlacement(box, photo)
  ctx.drawImage(img, p.x, p.y, p.w, p.h)
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('Gagal menyiapkan foto'))), 'image/png'),
  )
}
