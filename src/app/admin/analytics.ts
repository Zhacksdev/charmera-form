import type { Order } from '@/lib/supabase'

// Statuses where the money has actually come in; earlier ones count as pending income.
export const PAID_STATUSES = ['Terbayar', 'Diproses', 'Selesai']

export type Period = '7d' | '30d' | 'month' | 'all'

export const PERIODS: { id: Period; label: string }[] = [
  { id: '7d', label: '7 hari' },
  { id: '30d', label: '30 hari' },
  { id: 'month', label: 'Bulan ini' },
  { id: 'all', label: 'Semua' },
]

type Slot = { kind?: string; charm_id?: string; name?: string | null; image?: string | null } | null
type Item = {
  type?: string
  package_name?: string
  bracelet_count?: number
  slots?: Slot[]
  shape?: string
  shape_id?: string
  quantity?: number
  subtotal?: number
}

// What one order took out of stock.
export interface OrderUsage {
  bracelets: number
  customCharms: number
  charms: Map<string, number>
  // Keyed by shape id; orders from before shape ids were stored use the shape name.
  keychains: Map<string, number>
}

function itemsOf(order: Order): Item[] {
  return Array.isArray(order.items) ? (order.items as Item[]) : []
}

function add(map: Map<string, number>, key: string, n: number) {
  map.set(key, (map.get(key) ?? 0) + n)
}

export function orderUsage(order: Order): OrderUsage {
  const usage: OrderUsage = { bracelets: 0, customCharms: 0, charms: new Map(), keychains: new Map() }
  for (const item of itemsOf(order)) {
    if (item.type === 'keychain') {
      add(usage.keychains, item.shape_id ?? item.shape ?? '', Math.max(0, item.quantity ?? 1))
      continue
    }
    usage.bracelets += Math.max(0, item.bracelet_count ?? 1)
    for (const slot of item.slots ?? []) {
      if (!slot) continue
      if (slot.kind === 'custom') usage.customCharms += 1
      else if (slot.charm_id) add(usage.charms, slot.charm_id, 1)
    }
  }
  return usage
}

export function periodStart(period: Period, now = new Date()): Date | null {
  if (period === 'all') return null
  if (period === 'month') return new Date(now.getFullYear(), now.getMonth(), 1)
  const days = period === '7d' ? 7 : 30
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1))
  return start
}

export interface Bucket {
  key: string
  label: string
  total: number
  orders: number
}

export interface Ranked {
  key: string
  label: string
  value: number
  image?: string | null
}

export interface Analysis {
  income: number
  pending: number
  orders: number
  paidOrders: number
  averageOrder: number
  byCategory: Ranked[]
  series: Bucket[]
  seriesUnit: 'day' | 'month'
  sold: { bracelets: number; charms: number; customCharms: number; keychains: number }
  topCharms: Ranked[]
  topPackages: Ranked[]
  topShapes: Ranked[]
}

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

function top(map: Map<string, Ranked>, limit: number) {
  return [...map.values()].filter(r => r.value > 0).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label)).slice(0, limit)
}

function bump(map: Map<string, Ranked>, key: string, label: string, value: number, image?: string | null) {
  const current = map.get(key)
  if (current) current.value += value
  else map.set(key, { key, label, value, image })
}

export function analyze(
  orders: Order[],
  period: Period,
  names: { charm: (id: string) => { label: string; image: string | null } | null; shape: (key: string) => string },
  now = new Date(),
): Analysis {
  const start = periodStart(period, now)
  const inPeriod = orders.filter(o => !start || new Date(o.created_at) >= start)
  const paid = inPeriod.filter(o => PAID_STATUSES.includes(o.status))

  // Up to two months of days per bar; longer spans are shown per month.
  const firstDay = start ?? (inPeriod.length ? new Date(Math.min(...inPeriod.map(o => +new Date(o.created_at)))) : now)
  const spanDays = Math.ceil((+now - +firstDay) / 86_400_000) + 1
  const seriesUnit = spanDays <= 62 ? 'day' : 'month'
  const series = new Map<string, Bucket>()
  const cursor = new Date(firstDay.getFullYear(), firstDay.getMonth(), seriesUnit === 'day' ? firstDay.getDate() : 1)
  while (cursor <= now) {
    const key = seriesUnit === 'day' ? dayKey(cursor) : monthKey(cursor)
    const label = seriesUnit === 'day'
      ? cursor.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
      : cursor.toLocaleDateString('id-ID', { month: 'short', year: '2-digit' })
    series.set(key, { key, label, total: 0, orders: 0 })
    if (seriesUnit === 'day') cursor.setDate(cursor.getDate() + 1)
    else cursor.setMonth(cursor.getMonth() + 1)
  }

  const categories = new Map<string, Ranked>()
  const charms = new Map<string, Ranked>()
  const packages = new Map<string, Ranked>()
  const shapes = new Map<string, Ranked>()
  const sold = { bracelets: 0, charms: 0, customCharms: 0, keychains: 0 }

  for (const order of paid) {
    const created = new Date(order.created_at)
    const bucket = series.get(seriesUnit === 'day' ? dayKey(created) : monthKey(created))
    if (bucket) {
      bucket.total += order.total_price
      bucket.orders += 1
    }

    const items = itemsOf(order)
    if (items.length === 0) bump(categories, 'other', 'Lainnya (data lama)', order.total_price)
    for (const item of items) {
      if (item.type === 'keychain') {
        bump(categories, 'keychain', 'Keychain custom', item.subtotal ?? 0)
        // Grouped by display name, so old orders (stored by name or outline id) join the same row.
        const label = names.shape(item.shape_id ?? item.shape ?? '?')
        bump(shapes, label, label, Math.max(0, item.quantity ?? 1))
        continue
      }
      const loose = item.bracelet_count === 0
      bump(categories, loose ? 'loose' : 'set', loose ? 'Charm satuan' : 'Paket gelang', item.subtotal ?? 0)
      if (!loose && item.package_name) bump(packages, item.package_name, item.package_name, 1)
    }

    const usage = orderUsage(order)
    sold.bracelets += usage.bracelets
    sold.customCharms += usage.customCharms
    for (const [id, n] of usage.charms) {
      sold.charms += n
      const charm = names.charm(id)
      bump(charms, id, charm?.label ?? 'Charm', n, charm?.image)
    }
    for (const n of usage.keychains.values()) sold.keychains += n
  }

  const income = paid.reduce((sum, o) => sum + o.total_price, 0)
  return {
    income,
    pending: inPeriod.filter(o => !PAID_STATUSES.includes(o.status)).reduce((sum, o) => sum + o.total_price, 0),
    orders: inPeriod.length,
    paidOrders: paid.length,
    averageOrder: paid.length ? Math.round(income / paid.length) : 0,
    byCategory: top(categories, 10),
    series: [...series.values()],
    seriesUnit,
    sold,
    topCharms: top(charms, 8),
    topPackages: top(packages, 5),
    topShapes: top(shapes, 5),
  }
}

export interface DatedUsage {
  at: Date
  usage: OrderUsage
}

export function usagesOf(orders: Order[]): DatedUsage[] {
  return orders.map(o => ({ at: new Date(o.created_at), usage: orderUsage(o) }))
}

// Stock left = what was counted, minus everything ordered since that count.
export function stockLeft(
  stock: number | null | undefined,
  countedAt: string | null | undefined,
  usages: DatedUsage[],
  used: (usage: OrderUsage) => number,
) {
  if (stock === null || stock === undefined) return null
  const since = countedAt ? new Date(countedAt) : null
  const taken = usages.filter(u => !since || u.at > since).reduce((sum, u) => sum + used(u.usage), 0)
  return { stock, used: taken, left: stock - taken }
}

export const LOW_STOCK = 5
