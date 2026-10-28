import type { Json, Order } from '@/lib/supabase'
import { toCsv, parseCsv } from '@/lib/csv'

type Field = keyof Order

// One CSV column per entry. `parse` turns a cell back into the order field.
const COLUMNS: { field: Field; label: string; format?: (o: Order) => string | number; parse?: (cell: string) => unknown }[] = [
  { field: 'order_code', label: 'Kode' },
  { field: 'created_at', label: 'Tanggal', parse: cell => parseDate(cell) },
  { field: 'status', label: 'Status' },
  { field: 'customer_name', label: 'Nama' },
  { field: 'customer_whatsapp', label: 'WhatsApp' },
  { field: 'customer_email', label: 'Email' },
  { field: 'customer_instagram', label: 'Instagram' },
  { field: 'pickup_method', label: 'Pengambilan', format: o => o.pickup_method || o.customer_address },
  { field: 'package_name', label: 'Pesanan' },
  { field: 'charms', label: 'Charm', format: o => (o.charms ?? []).join(', '), parse: cell => cell.split(',').map(s => s.trim()).filter(Boolean) },
  { field: 'quantity', label: 'Qty', parse: cell => Number(cell.replace(/\D/g, '')) || 1 },
  { field: 'total_price', label: 'Total', parse: cell => Number(cell.replace(/,\d{1,2}$/, '').replace(/\D/g, '')) || 0 },
  { field: 'notes', label: 'Catatan' },
  { field: 'payment_proof_url', label: 'Bukti Bayar' },
  { field: 'items', label: 'Detail (JSON)', format: o => (o.items ? JSON.stringify(o.items) : ''), parse: cell => parseJson(cell) },
]

function parseDate(cell: string) {
  // Accept 28/10/2026 (and 28/10/2026 14:05) as well as anything Date understands.
  const dmy = cell.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[ T](\d{1,2})[:.](\d{2}))?/)
  const date = dmy
    ? new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]), Number(dmy[4] ?? 0), Number(dmy[5] ?? 0))
    : new Date(cell)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

function parseJson(cell: string): Json | undefined {
  try {
    return JSON.parse(cell)
  } catch {
    return undefined
  }
}

export function ordersToCsv(orders: Order[]) {
  return toCsv([
    COLUMNS.map(c => c.label),
    ...orders.map(o => COLUMNS.map(c => (c.format ? c.format(o) : (o[c.field] as string | number | null)))),
  ])
}

export function orderTemplateCsv() {
  return toCsv([COLUMNS.map(c => c.label)])
}

const normalize = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]/g, '')

// Headers may be our labels or the database column names, in any order and case.
// Only columns present in the file are returned, so an import never blanks out other fields.
export function csvToOrders(text: string): { rows: Partial<Order>[]; skipped: number } {
  const [header, ...lines] = parseCsv(text)
  if (!header) throw new Error('File CSV kosong.')
  const columns = header.map(h => COLUMNS.find(c => normalize(c.label) === normalize(h) || normalize(c.field) === normalize(h)))
  if (!columns.some(c => c?.field === 'customer_name')) throw new Error('Kolom "Nama" tidak ditemukan di baris pertama.')

  const rows: Partial<Order>[] = []
  let skipped = 0
  for (const line of lines) {
    const row: Record<string, unknown> = {}
    columns.forEach((column, i) => {
      if (!column) return
      const cell = (line[i] ?? '').trim()
      const value = column.parse ? (cell ? column.parse(cell) : undefined) : cell
      if (value !== undefined) row[column.field] = value
    })
    if (!String(row.customer_name ?? '').trim()) {
      skipped++
      continue
    }
    rows.push(row as Partial<Order>)
  }
  return { rows, skipped }
}
