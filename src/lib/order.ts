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

export interface KeychainDraft {
  shape: KeychainShape
  doubleSided: boolean
  qty: number
  photos: Partial<Record<KeychainSide, SidePhoto>>
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

// The lines shown on a set card. Admin-written items win; otherwise describe the configured contents.
export function packageItems(pkg: Package) {
  if (pkg.items?.some(i => i.trim())) return pkg.items.filter(i => i.trim())
  const c = packageContents(pkg)
  return [
    `${c.bracelets}x Plain Bracelet`,
    c.charms > 0 && `${c.charms}x Charm`,
    c.customCharms > 0 && `${c.customCharms}x Charm Custom`,
    c.keychains > 0 && `${c.keychains}x Keychain Custom`,
  ].filter((i): i is string => Boolean(i))
}

// Read counts from card text like "3x Plain", "9x Custom", "1x Keychain custom", "1x Charm".
export function contentsFromItems(items: string[]) {
  const out = { bracelet_count: 1, included_charms: 0, included_custom_charms: 0, included_keychains: 0 }
  for (const item of items) {
    const match = item.match(/(\d+)\s*(?:x|pcs)?\s*(.*)/i)
    if (!match) continue
    const n = Number(match[1])
    const what = match[2].toLowerCase()
    if (/keychain|key chain|ganci/.test(what)) out.included_keychains += n
    else if (/plain|bracelet|gelang/.test(what)) out.bracelet_count = Math.max(1, n)
    else if (/custom/.test(what)) out.included_custom_charms += n
    else if (/charm/.test(what)) out.included_charms += n
  }
  return out
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
    missing.push(draft.doubleSided && draft.photos.front ? 'Upload foto sisi belakang keychain.' : 'Isi foto keychain custom di paketmu.')
  } else if (draft.qty < c.keychains) {
    missing.push(`Jumlah keychain minimal ${c.keychains}.`)
  }
  return missing
}

// Change how many slots the board has, moving picks that no longer fit into free slots.
// Returns the picks that could not be kept so the caller can release their previews.
export function resizeSlots(slots: (CharmPick | null)[], length: number) {
  const next = slots.slice(0, length)
  while (next.length < length) next.push(null)
  const dropped: CharmPick[] = []
  for (const pick of slots.slice(length)) {
    if (!pick) continue
    const free = next.indexOf(null)
    if (free === -1) dropped.push(pick)
    else next[free] = pick
  }
  return { slots: next, dropped }
}

export function keychainUnitPrice(draft: KeychainDraft, config: ShopConfig) {
  return draft.doubleSided ? config.keychainDoublePrice : config.keychainPrice
}

export function isKeychainReady(draft: KeychainDraft) {
  return Boolean(draft.photos.front && (!draft.doubleSided || draft.photos.back))
}

export function keychainHasPhoto(draft: KeychainDraft) {
  return Boolean(draft.photos.front || draft.photos.back)
}

export const SHAPE_LABEL: Record<KeychainShape, string> = {
  rect: 'Persegi Panjang',
  square: 'Kotak',
  heart: 'Hati',
}
