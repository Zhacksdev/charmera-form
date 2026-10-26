import type { Charm, Package, Settings } from './supabase'
import { CHARM_CATALOG_COUNT } from './charm-catalog.generated'

export type Tab = 'charm' | 'keychain' | 'checkout'

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
  }
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

export interface BraceletSummary {
  catalogCount: number
  customCount: number
  includedUsed: number
  charmsTotal: number
  customTotal: number
  total: number
}

// The set price covers the bracelet plus `included_charms` regular charms; the cheapest picks are the free ones.
// Custom photo charms are always charged on top.
export function summarizeBracelet(
  pkg: Package | undefined,
  slots: (CharmPick | null)[],
  charmsById: Map<string, ShopCharm>,
  config: ShopConfig,
): BraceletSummary {
  const picks = slots.filter((s): s is CharmPick => s !== null)
  const catalogPrices = picks
    .filter(p => p.kind === 'catalog')
    .map(p => charmsById.get(p.charmId)?.price ?? config.charmPrice)
    .sort((a, b) => a - b)
  const included = Math.min(pkg?.included_charms ?? 0, catalogPrices.length)
  const charmsTotal = catalogPrices.slice(included).reduce((sum, price) => sum + price, 0)
  const customCount = picks.filter(p => p.kind === 'custom').length
  const customTotal = customCount * config.customCharmPrice
  return {
    catalogCount: catalogPrices.length,
    customCount,
    includedUsed: included,
    charmsTotal,
    customTotal,
    total: pkg ? pkg.price + charmsTotal + customTotal : 0,
  }
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
