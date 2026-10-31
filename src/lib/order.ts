import type { Charm, Package, Settings } from './supabase'
import { CHARM_CATALOG_COUNT } from './charm-catalog.generated'

export type Tab = 'charm' | 'keychain' | 'checkout'

export const ORDER_STATUSES = ['Menunggu verifikasi', 'Menunggu bayar', 'Terbayar', 'Diproses', 'Selesai']

export interface ShopCharm {
  id: string
  name: string
  price: number
  image: string | null
  emoji: string
}

export interface ShopConfig {
  batchLabel: string
  slotCount: number
  charmPrice: number
  customCharmPrice: number
  keychainPrice: number
  keychainDoublePrice: number
  pickupOptions: string[]
  qrisImage: string
  keychainShapes: KeychainShape[]
  whatsappNumber: string
  instagram: string
  tiktok: string
}

export type KeychainShape = 'rect' | 'square' | 'heart'
export type KeychainSide = 'front' | 'back'

export const KEYCHAIN_SHAPE_IDS: KeychainShape[] = ['rect', 'square', 'heart']

export interface SidePhoto {
  file: File
  src: string
  width: number
  height: number
  zoom: number
  dx: number
  dy: number
}

// `photo` keeps the original upload and its framing; `crop` is what fits the charm window.
export type CharmPick =
  | { uid: string; kind: 'catalog'; charmId: string }
  | { uid: string; kind: 'custom'; photo: SidePhoto; crop: Blob; preview: string }

export type KeychainPhotos = Partial<Record<KeychainSide, SidePhoto>>

// Shape and sides are shared; every keychain has its own photos, so `photos` is always `qty` long.
export interface KeychainDraft {
  shape: KeychainShape
  doubleSided: boolean
  qty: number
  photos: KeychainPhotos[]
}

export const DEFAULT_CONFIG: ShopConfig = {
  batchLabel: 'Open PO Batch 2',
  slotCount: 9,
  charmPrice: 7000,
  customCharmPrice: 10000,
  keychainPrice: 10000,
  keychainDoublePrice: 10000,
  pickupOptions: ['Ambil di booth Charmera', 'Dikirim (ongkir dikonfirmasi via WhatsApp)'],
  qrisImage: '/assets/qris.png',
  keychainShapes: KEYCHAIN_SHAPE_IDS,
  whatsappNumber: '',
  instagram: '',
  tiktok: '',
}

// Placeholder sets shown until packages are filled in Supabase. Prices are examples only.
export const FALLBACK_PACKAGES: Package[] = [
  { id: 'starter', name: 'Starter Set', price: 25000, description: null, items: ['1x Plain Bracelet', '1x Charm'], included_charms: 1, is_active: true, created_at: '', updated_at: '' },
  { id: 'daily', name: 'Daily Set', price: 39000, description: null, items: ['1x Plain Bracelet', '3x Charm'], included_charms: 3, is_active: true, created_at: '', updated_at: '' },
  { id: 'full', name: 'Full Set', price: 69000, description: null, items: ['1x Plain Bracelet', '9x Charm'], included_charms: 9, is_active: true, created_at: '', updated_at: '' },
]

export function catalogImage(index: number) {
  return `/charms/catalog-${String(index).padStart(2, '0')}.webp`
}

export const FALLBACK_CHARMS: ShopCharm[] = Array.from({ length: CHARM_CATALOG_COUNT }, (_, i) => ({
  id: `catalog-${i + 1}`,
  name: `Charm ${i + 1}`,
  price: DEFAULT_CONFIG.charmPrice,
  image: catalogImage(i + 1),
  emoji: '',
}))

// Alphabetical by name (numbers in natural order, so "Charm 2" comes before "Charm 10"); unnamed charms last.
export function sortCharms<T extends Pick<Charm, 'name' | 'sort_order'>>(charms: T[]): T[] {
  return [...charms].sort((a, b) => {
    if (!a.name !== !b.name) return a.name ? -1 : 1
    return (a.name ?? '').localeCompare(b.name ?? '', 'id', { numeric: true, sensitivity: 'base' }) || a.sort_order - b.sort_order
  })
}

export function toShopCharm(charm: Charm, fallbackPrice: number, position: number): ShopCharm {
  const image = charm.image_url || (charm.catalog_index ? catalogImage(charm.catalog_index) : null)
  return {
    id: charm.id,
    name: charm.name || `Charm ${position + 1}`,
    price: charm.price ?? fallbackPrice,
    image,
    emoji: charm.emoji,
  }
}

export function toShopConfig(settings: Partial<Settings> | null): ShopConfig {
  if (!settings) return DEFAULT_CONFIG
  const shapes = KEYCHAIN_SHAPE_IDS.filter(s => settings.keychain_shapes?.includes(s))
  return {
    batchLabel: settings.batch_label || DEFAULT_CONFIG.batchLabel,
    slotCount: settings.slot_count || DEFAULT_CONFIG.slotCount,
    charmPrice: settings.charm_price ?? DEFAULT_CONFIG.charmPrice,
    customCharmPrice: settings.custom_charm_price ?? DEFAULT_CONFIG.customCharmPrice,
    keychainPrice: settings.keychain_price ?? DEFAULT_CONFIG.keychainPrice,
    keychainDoublePrice: settings.keychain_double_price ?? DEFAULT_CONFIG.keychainDoublePrice,
    pickupOptions: settings.pickup_options?.length ? settings.pickup_options : DEFAULT_CONFIG.pickupOptions,
    qrisImage: settings.qris_image_url || DEFAULT_CONFIG.qrisImage,
    keychainShapes: shapes.length ? shapes : DEFAULT_CONFIG.keychainShapes,
    whatsappNumber: settings.whatsapp_number || '',
    instagram: settings.instagram_username || '',
    tiktok: settings.tiktok_username || '',
  }
}

// wa.me needs the international form, so a local 08xx number becomes 628xx.
export function whatsappLink(number: string, message: string) {
  const digits = number.replace(/\D/g, '').replace(/^0/, '62')
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}` : null
}

export function formatRupiah(value: number) {
  return `Rp. ${value.toLocaleString('id-ID')}`
}

export function formatShortPrice(value: number) {
  return value % 1000 === 0 ? `${value / 1000}k` : formatRupiah(value)
}

export function newUid() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

export function newOrderCode() {
  const stamp = Date.now().toString(36).toUpperCase().slice(-5)
  const random = Math.random().toString(36).toUpperCase().slice(2, 5)
  return `CHM-${stamp}${random}`
}

export interface PackageContents {
  bracelets: number
  charms: number
  customCharms: number
  keychains: number
}

export function packageContents(pkg: Package | undefined): PackageContents {
  return {
    bracelets: Math.max(1, pkg?.bracelet_count ?? 1),
    charms: pkg?.included_charms ?? 0,
    customCharms: pkg?.included_custom_charms ?? 0,
    keychains: pkg?.included_keychains ?? 0,
  }
}

// The fixed lines on a set card, built from the checklist the admin fills in (never free text).
export function packageItems(pkg: Package) {
  const c = packageContents(pkg)
  return [
    (pkg.bracelet_count ?? 1) > 0 && `${c.bracelets}x Plain Bracelet`,
    c.charms > 0 && `${c.charms}x Charm`,
    c.customCharms > 0 && `${c.customCharms}x Charm Custom`,
    c.keychains > 0 && `${c.keychains}x Custom Keychain`,
  ].filter((i): i is string => Boolean(i))
}

export interface BraceletSummary {
  catalogCount: number
  customCount: number
  includedUsed: number
  includedCustomUsed: number
  charmsTotal: number
  customTotal: number
  total: number
}

// The set price covers its bracelets plus `included_charms` regular charms (the cheapest picks are the free ones)
// and `included_custom_charms` photo charms. Anything beyond that is an add-on at the unit price.
export function summarizeBracelet(
  pkg: Package | undefined,
  slots: (CharmPick | null)[],
  charmsById: Map<string, ShopCharm>,
  config: ShopConfig,
): BraceletSummary {
  const contents = packageContents(pkg)
  const picks = slots.filter((s): s is CharmPick => s !== null)
  const catalogPrices = picks
    .filter(p => p.kind === 'catalog')
    .map(p => charmsById.get(p.charmId)?.price ?? config.charmPrice)
    .sort((a, b) => a - b)
  const included = Math.min(contents.charms, catalogPrices.length)
  const charmsTotal = catalogPrices.slice(included).reduce((sum, price) => sum + price, 0)
  const customCount = picks.filter(p => p.kind === 'custom').length
  const includedCustom = pkg ? Math.min(contents.customCharms, customCount) : 0
  const customTotal = (customCount - includedCustom) * config.customCharmPrice
  return {
    catalogCount: catalogPrices.length,
    customCount,
    includedUsed: included,
    includedCustomUsed: includedCustom,
    charmsTotal,
    customTotal,
    total: pkg ? pkg.price + charmsTotal + customTotal : 0,
  }
}

// Keychains included in a set are free, except the double-sided upgrade over the single-sided price.
export function keychainCharge(draft: KeychainDraft, config: ShopConfig, included: number) {
  if (!keychainHasPhoto(draft)) return { total: 0, included: 0 }
  const covered = Math.min(included, draft.qty)
  const upgrade = draft.doubleSided ? Math.max(0, config.keychainDoublePrice - config.keychainPrice) : 0
  return { total: (draft.qty - covered) * keychainUnitPrice(draft, config) + covered * upgrade, included: covered }
}

// What the chosen set still needs before checkout, as messages for the customer.
export function packageShortfall(pkg: Package | undefined, slots: (CharmPick | null)[], draft: KeychainDraft) {
  if (!pkg) return []
  const c = packageContents(pkg)
  const custom = slots.filter(s => s?.kind === 'custom').length
  const catalog = slots.filter(s => s?.kind === 'catalog').length
  const missing: string[] = []
  if (custom < c.customCharms) missing.push(`Upload ${c.customCharms - custom} foto charm custom lagi (${custom}/${c.customCharms}).`)
  if (catalog < c.charms) missing.push(`Pilih ${c.charms - catalog} charm lagi (${catalog}/${c.charms}).`)
  if (c.keychains > 0 && !isKeychainReady(draft)) {
    missing.push(keychainMissingMessage(draft))
  } else if (draft.qty < c.keychains) {
    missing.push(`Jumlah keychain minimal ${c.keychains}.`)
  }
  return missing
}

// Resize the bracelet board to `length` slots. Picks that lose their slot join the tray (picked but not yet
// placed on a bracelet); with `autoPlace` the tray is emptied into free slots in order, which is how a single
// bracelet works. Picks beyond the board's capacity are returned so the caller can release their previews.
export function resizeBoard(slots: (CharmPick | null)[], tray: CharmPick[], length: number, autoPlace: boolean) {
  const next = slots.slice(0, length)
  while (next.length < length) next.push(null)
  const pending = [...slots.slice(length).filter((s): s is CharmPick => s !== null), ...tray]
  const free = next.filter(s => s === null).length
  const dropped = pending.splice(free)
  if (!autoPlace) return { slots: next, tray: pending, dropped }
  for (const pick of pending) next[next.indexOf(null)] = pick
  return { slots: next, tray: [], dropped }
}

export function keychainUnitPrice(draft: KeychainDraft, config: ShopConfig) {
  return draft.doubleSided ? config.keychainDoublePrice : config.keychainPrice
}

// Resize to `qty` keychains; the photos of removed keychains are returned so the caller can release them.
export function withKeychainQty(draft: KeychainDraft, qty: number) {
  const photos = draft.photos.slice(0, qty)
  while (photos.length < qty) photos.push({})
  return { draft: { ...draft, qty, photos }, dropped: draft.photos.slice(qty) }
}

export function isKeychainPhotoReady(photos: KeychainPhotos | undefined, doubleSided: boolean) {
  return Boolean(photos?.front && (!doubleSided || photos.back))
}

export function keychainReadyCount(draft: KeychainDraft) {
  return draft.photos.slice(0, draft.qty).filter(p => isKeychainPhotoReady(p, draft.doubleSided)).length
}

export function isKeychainReady(draft: KeychainDraft) {
  return draft.qty > 0 && keychainReadyCount(draft) === draft.qty
}

export function keychainHasPhoto(draft: KeychainDraft) {
  return draft.photos.some(p => p.front || p.back)
}

export function keychainMissingMessage(draft: KeychainDraft) {
  const missing = draft.qty - keychainReadyCount(draft)
  const sides = draft.doubleSided ? ' (sisi depan & belakang)' : ''
  return draft.qty === 1
    ? `Upload foto keychain custom${sides}.`
    : `Upload foto untuk ${missing} keychain lagi${sides} (${draft.qty - missing}/${draft.qty}).`
}

export const SHAPE_LABEL: Record<KeychainShape, string> = {
  rect: 'Persegi Panjang',
  square: 'Kotak',
  heart: 'Hati',
}
