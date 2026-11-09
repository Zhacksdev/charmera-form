/* eslint-disable @next/next/no-img-element -- charm art comes from Supabase Storage and local tiles */
'use client'

import { useMemo, useState } from 'react'
import type { Charm, Order, Settings } from '@/lib/supabase'
import { SHAPE_LABEL, shapeOptions } from '@/lib/order'
import type { KeychainShape } from '@/lib/order'
import { LOW_STOCK, PERIODS, analyze, stockLeft, usagesOf } from './analytics'
import type { Bucket, Period, Ranked } from './analytics'
import type { StockUpdate } from './actions'

const rupiah = (n: number) => `Rp ${n.toLocaleString('id')}`
const compact = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toLocaleString('id', { maximumFractionDigits: 1 })} jt` : n >= 1000 ? `${Math.round(n / 1000)} rb` : String(n)

function charmImage(charm: Pick<Charm, 'image_url' | 'catalog_index'>) {
  return charm.image_url || (charm.catalog_index ? `/charms/catalog-${String(charm.catalog_index).padStart(2, '0')}.webp` : null)
}

function Tile({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'main' }) {
  return (
    <div className={`rounded-xl border p-4 ${tone === 'main' ? 'border-cherry bg-cherry text-cream' : 'border-line bg-card'}`}>
      <p className={`text-sm ${tone === 'main' ? 'text-cream/80' : 'text-char/70'}`}>{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${tone === 'main' ? '' : 'text-char'}`}>{value}</p>
      {hint && <p className={`mt-1 text-xs ${tone === 'main' ? 'text-cream/80' : 'text-char/60'}`}>{hint}</p>}
    </div>
  )
}

function Card({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-card p-5">
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      {note && <p className="mt-1 text-xs text-char/60">{note}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

// Income over time: one series, so one color and no legend; hover (or focus) a bar for its numbers.
function IncomeChart({ series, unit }: { series: Bucket[]; unit: 'day' | 'month' }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(1, ...series.map(b => b.total))
  const active = hover !== null ? series[hover] : null
  const labelEvery = Math.ceil(series.length / 8)
  if (series.every(b => b.total === 0)) return <p className="text-sm text-char/60">Belum ada pemasukan terbayar di periode ini.</p>

  return (
    <div>
      <div className="mb-2 h-10 text-sm" aria-live="polite">
        {active ? (
          <p>
            <b>{active.label}</b> · <span className="tabular-nums">{rupiah(active.total)}</span>{' '}
            <span className="text-char/60">({active.orders} pesanan)</span>
          </p>
        ) : (
          <p className="text-char/60">Arahkan ke batang untuk melihat angkanya. Tertinggi {rupiah(max)}.</p>
        )}
      </div>
      <div className="relative">
        <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-line" aria-hidden="true" />
        <span className="pointer-events-none absolute -top-2 right-0 bg-card pl-1 text-[10px] text-char/50">{compact(max)}</span>
        <div className="flex h-48 items-end gap-[2px] border-b border-char/30" role="list" aria-label={`Pemasukan per ${unit === 'day' ? 'hari' : 'bulan'}`}>
          {series.map((b, i) => (
            <button
              key={b.key}
              type="button"
              role="listitem"
              aria-label={`${b.label}: ${rupiah(b.total)}, ${b.orders} pesanan`}
              className="group flex h-full flex-1 items-end focus:outline-none"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
            >
              <span
                className={`block w-full rounded-t-[4px] transition-colors ${hover === i ? 'bg-cherry-dark' : 'bg-cherry'} ${b.total ? '' : 'opacity-0'}`}
                style={{ height: `${(b.total / max) * 100}%`, minHeight: b.total ? 2 : 0 }}
              />
            </button>
          ))}
        </div>
      </div>
      <div className="mt-1 flex gap-[2px] text-[10px] text-char/50" aria-hidden="true">
        {series.map((b, i) => (
          <span key={b.key} className="flex-1 truncate text-center">{i % labelEvery === 0 ? b.label : ''}</span>
        ))}
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-char/70">Lihat sebagai tabel</summary>
        <table className="mt-2 w-full text-left">
          <thead className="text-char/60"><tr><th className="py-1">Tanggal</th><th>Pesanan</th><th className="text-right">Pemasukan</th></tr></thead>
          <tbody>
            {series.filter(b => b.total > 0).map(b => (
              <tr key={b.key} className="border-t border-line">
                <td className="py-1">{b.label}</td>
                <td className="tabular-nums">{b.orders}</td>
                <td className="text-right tabular-nums">{rupiah(b.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}

// Ranked list with a bar per row; `format` turns the value into its label.
function RankedBars({ rows, format, empty }: { rows: Ranked[]; format: (n: number) => string; empty: string }) {
  if (rows.length === 0) return <p className="text-sm text-char/60">{empty}</p>
  const max = Math.max(...rows.map(r => r.value))
  return (
    <ol className="space-y-2">
      {rows.map((row, i) => (
        <li key={row.key} className="flex items-center gap-3 text-sm">
          <span className="w-4 text-right text-xs font-bold text-char/50">{i + 1}</span>
          {row.image !== undefined && (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-line bg-rose/30">
              {row.image ? <img src={row.image} alt="" className="h-full w-full object-contain" /> : '•'}
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="flex justify-between gap-2">
              <span className="truncate font-semibold">{row.label}</span>
              <span className="shrink-0 tabular-nums text-char/80">{format(row.value)}</span>
            </span>
            <span className="mt-1 block h-2 rounded-full bg-line/60">
              <span className="block h-2 rounded-full bg-cherry" style={{ width: `${(row.value / max) * 100}%` }} />
            </span>
          </span>
        </li>
      ))}
    </ol>
  )
}

type StockRow = {
  key: string
  group: 'Bahan' | 'Keychain' | 'Charm'
  label: string
  image?: string | null
  stock: number | null | undefined
  countedAt: string | null | undefined
  used: number | null
  left: number | null
}

function StockBadge({ left }: { left: number | null }) {
  if (left === null) return <span className="text-xs text-char/50">Tidak dilacak</span>
  if (left <= 0) return <span className="rounded-full bg-cherry px-2 py-0.5 text-xs font-bold text-cream">⛔ Habis ({left})</span>
  if (left <= LOW_STOCK) return <span className="rounded-full bg-butter px-2 py-0.5 text-xs font-bold text-char">⚠ Menipis · {left}</span>
  return <span className="rounded-full bg-[#CFE8C4] px-2 py-0.5 text-xs font-bold text-char">✓ {left}</span>
}

export function FinanceDashboard({ orders, charms, settings, busy, onSaveStock }: {
  orders: Order[]
  charms: Charm[]
  settings: Settings | null
  busy: boolean
  onSaveStock: (update: StockUpdate) => Promise<boolean>
}) {
  const [period, setPeriod] = useState<Period>('30d')
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [search, setSearch] = useState('')
  const [onlyTracked, setOnlyTracked] = useState(false)

  const shapes = useMemo(() => shapeOptions(settings), [settings])
  const charmById = useMemo(() => new Map(charms.map(c => [c.id, c])), [charms])

  const analysis = useMemo(() => analyze(orders, period, {
    charm: id => {
      const charm = charmById.get(id)
      if (charm) return { label: charm.name || 'Tanpa nama', image: charmImage(charm) }
      const n = id.match(/^catalog-(\d+)$/)?.[1]
      return n ? { label: `Charm ${n}`, image: `/charms/catalog-${n.padStart(2, '0')}.webp` } : null
    },
    shape: key => shapes.find(s => s.id === key)?.label ?? SHAPE_LABEL[key as KeychainShape] ?? key,
  }), [orders, period, charmById, shapes])

  const stockRows = useMemo<StockRow[]>(() => {
    const usages = usagesOf(orders)
    const row = (
      key: string, group: StockRow['group'], label: string, stock: number | null | undefined, countedAt: string | null | undefined,
      used: Parameters<typeof stockLeft>[3], image?: string | null,
    ): StockRow => {
      const s = stockLeft(stock, countedAt, usages, used)
      return { key, group, label, image, stock, countedAt, used: s?.used ?? null, left: s?.left ?? null }
    }
    return [
      row('bracelets', 'Bahan', 'Plain Bracelet', settings?.stock_bracelets, settings?.stock_bracelets_at, u => u.bracelets),
      row('custom', 'Bahan', 'Link charm custom (foto)', settings?.stock_custom_charms, settings?.stock_custom_charms_at, u => u.customCharms),
      ...shapes.map(shape => row(
        `shape:${shape.id}`, 'Keychain', `Keychain ${shape.label}${shape.size ? ` (${shape.size})` : ''}`, shape.stock, shape.stock_at,
        // Older orders stored the shape name (or the outline id) instead of the shape id.
        u => (u.keychains.get(shape.id) ?? 0) + (shape.label !== shape.id ? u.keychains.get(shape.label) ?? 0 : 0),
      )),
      ...charms.map(charm => row(
        `charm:${charm.id}`, 'Charm', charm.name || 'Tanpa nama', charm.stock, charm.stock_updated_at, u => u.charms.get(charm.id) ?? 0, charmImage(charm),
      )),
    ]
  }, [orders, settings, shapes, charms])

  const lowStock = stockRows.filter(r => r.left !== null && r.left <= LOW_STOCK)
  const visibleRows = stockRows.filter(r =>
    (!onlyTracked || r.left !== null) && (!search.trim() || r.label.toLowerCase().includes(search.trim().toLowerCase())),
  )
  const changed = Object.keys(draft).filter(key => {
    const row = stockRows.find(r => r.key === key)
    const value = draft[key].trim() === '' ? null : Number(draft[key])
    return row && value !== (row.stock ?? null)
  })

  async function save() {
    const value = (key: string) => (draft[key].trim() === '' ? null : Math.max(0, Math.round(Number(draft[key]))))
    const update: StockUpdate = { charms: [], shapes: [] }
    for (const key of changed) {
      if (key === 'bracelets') update.bracelets = value(key)
      else if (key === 'custom') update.customCharms = value(key)
      else if (key.startsWith('shape:')) update.shapes!.push({ id: key.slice(6), stock: value(key) })
      else update.charms!.push({ id: key.slice(6), stock: value(key) })
    }
    if (await onSaveStock(update)) setDraft({})
  }

  const totalSold = analysis.sold.bracelets + analysis.sold.charms + analysis.sold.customCharms + analysis.sold.keychains
  const categoryTotal = analysis.byCategory.reduce((sum, r) => sum + r.value, 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-2xl font-semibold">Analisa Keuangan</h2>
        <div className="flex flex-wrap gap-1 rounded-full border border-line bg-card p-1" role="radiogroup" aria-label="Periode">
          {PERIODS.map(p => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={period === p.id}
              onClick={() => setPeriod(p.id)}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold transition-all ${period === p.id ? 'bg-cherry text-cream' : 'hover:bg-rose/30'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {lowStock.length > 0 && (
        <a href="#stok" className="block rounded-xl border-2 border-cherry bg-butter/60 p-3 text-sm font-semibold">
          ⚠ {lowStock.length} item stoknya menipis atau habis: {lowStock.slice(0, 4).map(r => r.label).join(', ')}
          {lowStock.length > 4 ? `, +${lowStock.length - 4} lainnya` : ''}. Lihat bagian Stok.
        </a>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile tone="main" label="Total pemasukan" value={rupiah(analysis.income)} hint="Pesanan Terbayar, Diproses & Selesai" />
        <Tile label="Menunggu pembayaran" value={rupiah(analysis.pending)} hint="Belum diverifikasi / belum bayar" />
        <Tile label="Pesanan terbayar" value={`${analysis.paidOrders} / ${analysis.orders}`} hint="dari semua pesanan di periode ini" />
        <Tile label="Rata-rata per pesanan" value={rupiah(analysis.averageOrder)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card title={`Pemasukan per ${analysis.seriesUnit === 'day' ? 'hari' : 'bulan'}`} note="Hanya pesanan yang sudah terbayar, menurut tanggal pesan.">
            <IncomeChart series={analysis.series} unit={analysis.seriesUnit} />
          </Card>
        </div>
        <Card title="Sumber pemasukan">
          <RankedBars
            rows={analysis.byCategory}
            format={n => `${rupiah(n)} · ${categoryTotal ? Math.round((n / categoryTotal) * 100) : 0}%`}
            empty="Belum ada data."
          />
        </Card>
      </div>

      <Card title="Item terjual" note={`${totalSold} item dari pesanan terbayar di periode ini.`}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tile label="Plain Bracelet" value={String(analysis.sold.bracelets)} />
          <Tile label="Charm katalog" value={String(analysis.sold.charms)} />
          <Tile label="Charm custom" value={String(analysis.sold.customCharms)} />
          <Tile label="Keychain custom" value={String(analysis.sold.keychains)} />
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Charm favorit">
          <RankedBars rows={analysis.topCharms} format={n => `${n} pcs`} empty="Belum ada charm katalog yang terjual." />
        </Card>
        <Card title="Paket favorit">
          <RankedBars rows={analysis.topPackages} format={n => `${n} pesanan`} empty="Belum ada paket yang terjual." />
        </Card>
        <Card title="Bentuk keychain favorit">
          <RankedBars rows={analysis.topShapes} format={n => `${n} pcs`} empty="Belum ada keychain yang terjual." />
        </Card>
      </div>

      <section id="stok" className="rounded-2xl border border-line bg-card p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold">Stok</h2>
            <p className="mt-1 max-w-2xl text-xs text-char/60">
              Isi jumlah stok yang ada sekarang lalu simpan. Sisa stok berkurang otomatis dari setiap pesanan yang masuk setelah itu
              (semua status). Kosongkan untuk berhenti melacak item tersebut. Stok ≤ {LOW_STOCK} ditandai menipis.
            </p>
          </div>
          <button
            type="button"
            onClick={save}
            disabled={busy || changed.length === 0}
            className="rounded-full bg-cherry px-5 py-2 font-semibold text-cream transition-all hover:bg-cherry/90 disabled:opacity-50"
          >
            {busy ? 'Menyimpan…' : `Simpan stok${changed.length ? ` (${changed.length})` : ''}`}
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          <input
            type="search"
            placeholder="Cari item…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full max-w-xs rounded-xl border border-line bg-cream px-4 py-2 focus:border-cherry focus:outline-none"
          />
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={onlyTracked} onChange={e => setOnlyTracked(e.target.checked)} className="accent-cherry" />
            Hanya yang dilacak
          </label>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-char/60">
              <tr>
                <th className="py-2">Item</th>
                <th>Stok dihitung</th>
                <th>Terpakai sejak</th>
                <th>Sisa</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, i) => (
                <tr key={row.key} className={`border-t border-line ${i > 0 && visibleRows[i - 1].group !== row.group ? 'border-t-2 border-t-char/20' : ''}`}>
                  <td className="py-2 pr-3">
                    <span className="flex items-center gap-2">
                      {row.image !== undefined && (
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-line bg-rose/30">
                          {row.image ? <img src={row.image} alt="" className="h-full w-full object-contain" /> : '•'}
                        </span>
                      )}
                      <span>
                        <span className="font-semibold">{row.label}</span>
                        <span className="block text-xs text-char/50">{row.group}</span>
                      </span>
                    </span>
                  </td>
                  <td className="pr-3">
                    <input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      aria-label={`Stok ${row.label}`}
                      placeholder="—"
                      value={draft[row.key] ?? (row.stock ?? '')}
                      onChange={e => setDraft(prev => ({ ...prev, [row.key]: e.target.value }))}
                      className="w-24 rounded-lg border border-line bg-cream px-2 py-1.5 tabular-nums focus:border-cherry focus:outline-none"
                    />
                    {row.countedAt && (
                      <span className="block text-[11px] text-char/50">
                        {new Date(row.countedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    )}
                  </td>
                  <td className="tabular-nums">{row.used ?? '—'}</td>
                  <td><StockBadge left={row.left} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {charms.length === 0 && (
            <p className="mt-3 text-xs text-char/60">
              Stok per charm bisa dilacak setelah charm ada di database (tab Charm → Masukkan data bawaan).
            </p>
          )}
        </div>
      </section>
    </div>
  )
}
