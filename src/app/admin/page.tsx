/* eslint-disable @next/next/no-img-element -- admin previews show Supabase Storage URLs */
'use client'

import { Fragment, useEffect, useState } from 'react'
import { supabase, UPLOAD_BUCKET } from '@/lib/supabase'
import type { Charm, Order, Package, Settings } from '@/lib/supabase'
import { DEFAULT_CONFIG, KEYCHAIN_SHAPE_IDS, ORDER_STATUSES, SHAPE_LABEL, packageItems } from '@/lib/order'
import type { KeychainShape } from '@/lib/order'
import {
  createCharmUpload, createQrisUpload, deleteCharm, deleteOrder, deletePackage, hasSession, importDefaultCatalog, importOrders, loadAdminData, login, logout,
  saveCharm, saveGeneralSettings, saveOrder, savePackage, savePrices, setQrisImage, updateOrderStatus,
} from './actions'
import type { Result } from './actions'
import { csvToOrders, orderTemplateCsv, ordersToCsv } from './orders-csv'
import { downloadFile } from '@/lib/csv'

const IMPORT_CHUNK = 200

type PackageContentsPatch = Pick<Package, 'bracelet_count' | 'included_charms' | 'included_custom_charms' | 'included_keychains'>

// The fixed checklist of what a set contains. Charm is one row with a type, stored as either
// included_charms (catalog) or included_custom_charms (customer photo).
function PackageContentsEditor({ pkg, onChange }: { pkg: Partial<Package>; onChange: (patch: Partial<PackageContentsPatch>) => void }) {
  const bracelets = pkg.bracelet_count ?? 1
  const custom = (pkg.included_custom_charms ?? 0) > 0
  const charms = (pkg.included_charms ?? 0) + (pkg.included_custom_charms ?? 0)
  const keychains = pkg.included_keychains ?? 0
  const setCharms = (count: number, isCustom: boolean) =>
    onChange({ included_charms: isCustom ? 0 : count, included_custom_charms: isCustom ? count : 0 })

  const rows = [
    { label: 'Plain Bracelet', count: bracelets, set: (n: number) => onChange({ bracelet_count: n }) },
    { label: 'Charm', count: charms, set: (n: number) => setCharms(n, custom) },
    { label: 'Custom Keychain', count: keychains, set: (n: number) => onChange({ included_keychains: n }) },
  ]

  return (
    <fieldset className="rounded-xl border border-line p-3">
      <legend className="px-1 text-sm font-semibold">Isi paket</legend>
      <div className="space-y-2">
        {rows.map(row => (
          <div key={row.label} className="flex flex-wrap items-center gap-3">
            <label className="flex min-w-36 flex-1 items-center gap-2 font-semibold">
              <input
                type="checkbox"
                checked={row.count > 0}
                onChange={e => row.set(e.target.checked ? 1 : 0)}
                className="accent-cherry"
              />
              {row.label}
            </label>
            <input
              type="number"
              min={1}
              aria-label={`Jumlah ${row.label}`}
              disabled={row.count === 0}
              value={row.count || ''}
              onChange={e => row.set(Math.max(1, parseInt(e.target.value) || 1))}
              className={`${inputClass} !w-20 !py-2 text-center disabled:opacity-40`}
            />
            {row.label === 'Charm' && (
              <select
                aria-label="Jenis charm"
                disabled={charms === 0}
                value={custom ? 'custom' : 'catalog'}
                onChange={e => setCharms(charms, e.target.value === 'custom')}
                className={`${inputClass} !w-auto !py-2 disabled:opacity-40`}
              >
                <option value="catalog">Non-custom</option>
                <option value="custom">Custom (foto)</option>
              </select>
            )}
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-char/60">
        Jumlah Plain Bracelet menentukan jumlah gelang di kotak Kustomisasi. Charm custom mengunci katalog (charm non-custom jadi add-on).
        Paket dengan Custom Keychain langsung menampilkan editor keychain dan wajib diisi sebelum bayar.
      </p>
    </fieldset>
  )
}

const MAX_QR_BYTES = 5 * 1024 * 1024

type Tab = 'orders' | 'prices' | 'packages' | 'charms' | 'settings'
const TABS: { id: Tab; label: string }[] = [
  { id: 'orders', label: 'Pesanan' },
  { id: 'prices', label: 'Harga' },
  { id: 'packages', label: 'Paket' },
  { id: 'charms', label: 'Charm' },
  { id: 'settings', label: 'Pengaturan' },
]

const UNIT_PRICES = [
  { key: 'charm_price', label: 'Charm biasa', hint: 'Per charm dari katalog', fallback: DEFAULT_CONFIG.charmPrice },
  { key: 'custom_charm_price', label: 'Charm custom', hint: 'Per charm dengan foto pelanggan', fallback: DEFAULT_CONFIG.customCharmPrice },
  { key: 'keychain_price', label: 'Keychain satu sisi', hint: 'Per pcs', fallback: DEFAULT_CONFIG.keychainPrice },
  { key: 'keychain_double_price', label: 'Keychain bolak balik', hint: 'Per pcs', fallback: DEFAULT_CONFIG.keychainDoublePrice },
] as const
type UnitKey = (typeof UNIT_PRICES)[number]['key']

interface PriceDraft {
  unit: Record<UnitKey, string>
  packages: Record<string, { price: string; included_charms: string }>
  charms: Record<string, string>
}

interface SettingsDraft {
  batch_label: string
  slot_count: string
  whatsapp_number: string
  pickup_options: string
  keychain_shapes: KeychainShape[]
  instagram_username: string
  tiktok_username: string
}

const secondaryButton = 'px-4 py-2 rounded-full border-2 border-cherry text-cherry font-semibold hover:bg-rose/30 transition-all'
const inputClass = 'w-full px-4 py-3 rounded-xl border border-line bg-cream focus:border-cherry focus:outline-none'

function toText(value: number | null | undefined) {
  return value === null || value === undefined ? '' : String(value)
}

function toNumber(value: string) {
  return value.trim() === '' ? null : Number(value)
}

// A set includes either catalog or custom charms; the price tab edits whichever one it has.
function isCustomPackage(pkg: Partial<Package> | undefined) {
  return (pkg?.included_custom_charms ?? 0) > 0
}

function priceDraftFrom(settings: Settings | null, packages: Package[], charms: Charm[]): PriceDraft {
  return {
    unit: Object.fromEntries(UNIT_PRICES.map(u => [u.key, toText(settings?.[u.key])])) as Record<UnitKey, string>,
    packages: Object.fromEntries(packages.map(p => [p.id, {
      price: String(p.price),
      included_charms: toText(isCustomPackage(p) ? p.included_custom_charms : p.included_charms ?? 0),
    }])),
    charms: Object.fromEntries(charms.map(c => [c.id, toText(c.price)])),
  }
}

function settingsDraftFrom(settings: Settings | null): SettingsDraft {
  return {
    batch_label: settings?.batch_label ?? '',
    slot_count: String(settings?.slot_count ?? DEFAULT_CONFIG.slotCount),
    whatsapp_number: settings?.whatsapp_number ?? '',
    pickup_options: (settings?.pickup_options ?? DEFAULT_CONFIG.pickupOptions).join('\n'),
    keychain_shapes: settings?.keychain_shapes?.length
      ? KEYCHAIN_SHAPE_IDS.filter(s => settings.keychain_shapes?.includes(s))
      : DEFAULT_CONFIG.keychainShapes,
    instagram_username: settings?.instagram_username ?? '',
    tiktok_username: settings?.tiktok_username ?? '',
  }
}

function PriceInput({ value, onChange, placeholder, label }: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  label: string
}) {
  return (
    <div className="flex items-center rounded-xl border border-line bg-cream focus-within:border-cherry">
      <span className="pl-4 pr-1 text-sm font-semibold text-char/60">Rp</span>
      <input
        type="number"
        min={0}
        step={500}
        inputMode="numeric"
        aria-label={label}
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-transparent px-2 py-3 focus:outline-none"
      />
    </div>
  )
}

type OrderItem = {
  type?: string
  package_name?: string
  shape?: string
  double_sided?: boolean
  quantity?: number
  subtotal?: number
  bracelet_count?: number
  layout_url?: string | null
  slots?: ({ position: number; bracelet?: number; kind: string; name?: string | null; photo_url?: string; original_url?: string } | null)[]
  sides?: KeychainSides
  keychains?: { index: number; sides: KeychainSides }[]
}

type KeychainSides = { side: string; print_url: string; original_url: string }[]

function OrderDetails({ order }: { order: Order }) {
  const items = Array.isArray(order.items) ? (order.items as OrderItem[]) : []
  return (
    <div className="grid gap-3 text-sm md:grid-cols-2">
      <div className="space-y-1">
        <p><b>Kode:</b> {order.order_code || order.id.slice(0, 8)}</p>
        <p><b>Email:</b> {order.customer_email || '-'}</p>
        <p><b>Instagram:</b> {order.customer_instagram ? `@${order.customer_instagram}` : '-'}</p>
        <p><b>Pengambilan:</b> {order.pickup_method || order.customer_address}</p>
        {order.notes && <p><b>Pesan:</b> {order.notes}</p>}
        {order.payment_proof_url && (
          <a href={order.payment_proof_url} target="_blank" rel="noreferrer" className="inline-block mt-1 text-cherry font-semibold underline">
            Lihat bukti bayar
          </a>
        )}
      </div>
      <div className="space-y-3">
        {items.map((item, index) => (
          <div key={index} className="rounded-xl border border-line p-3">
            <p className="font-semibold">
              {item.type === 'keychain'
                ? `Keychain ${item.shape} ${item.double_sided ? 'bolak balik' : 'satu sisi'} × ${item.quantity}`
                : `Italian Charm (${item.package_name})`}
              {item.subtotal !== undefined && <span className="text-cherry"> · Rp {item.subtotal.toLocaleString('id')}</span>}
            </p>
            {item.layout_url && (
              <a href={item.layout_url} target="_blank" rel="noreferrer" className="mt-2 block" title="Buka gambar susunan charm">
                <img src={item.layout_url} alt="Susunan charm di gelang" className="w-full rounded-lg border border-line bg-cream" />
                <span className="mt-1 block text-xs text-char/60">Susunan charm (klik untuk memperbesar)</span>
              </a>
            )}
            {item.slots && (
              <ol className="mt-1 list-decimal pl-5">
                {item.slots.map((slot, i) => slot && (
                  <li key={i} value={slot.position}>
                    {(item.bracelet_count ?? 1) > 1 && slot.bracelet ? <b>Gelang {slot.bracelet} · </b> : null}
                    {slot.kind === 'custom' ? (
                      <>
                        Charm custom:{' '}
                        <a href={slot.photo_url} target="_blank" rel="noreferrer" className="underline">siap cetak</a>
                        {slot.original_url && (
                          <>{' · '}<a href={slot.original_url} target="_blank" rel="noreferrer" className="underline">asli</a></>
                        )}
                      </>
                    ) : slot.name}
                  </li>
                ))}
              </ol>
            )}
            {/* Older orders stored one photo set in `sides`; newer ones store one per keychain. */}
            {(item.keychains ?? (item.sides ? [{ index: 1, sides: item.sides }] : [])).map(keychain => keychain.sides.map(side => (
              <p key={`${keychain.index}-${side.side}`}>
                {(item.keychains?.length ?? 0) > 1 && <b>Keychain {keychain.index} · </b>}
                {side.side === 'back' ? 'Belakang' : 'Depan'}:{' '}
                <a href={side.print_url} target="_blank" rel="noreferrer" className="underline">siap cetak</a>{' · '}
                <a href={side.original_url} target="_blank" rel="noreferrer" className="underline">asli</a>
              </p>
            )))}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function AdminPage() {
  const [isAuth, setIsAuth] = useState(false)
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const [tab, setTab] = useState<Tab>('orders')

  const [settings, setSettings] = useState<Settings | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [packages, setPackages] = useState<Package[]>([])
  const [charms, setCharms] = useState<Charm[]>([])
  const [prices, setPrices] = useState<PriceDraft>(() => priceDraftFrom(null, [], []))
  const [general, setGeneral] = useState<SettingsDraft>(() => settingsDraftFrom(null))

  const [editingPkg, setEditingPkg] = useState<Partial<Package> | null>(null)
  const [editingCharm, setEditingCharm] = useState<Partial<Charm> | null>(null)
  const [openOrder, setOpenOrder] = useState<string | null>(null)
  const [editingOrder, setEditingOrder] = useState<Partial<Order> | null>(null)
  const [qrFile, setQrFile] = useState<File | null>(null)
  const [qrPreview, setQrPreview] = useState<string | null>(null)
  const [charmFile, setCharmFile] = useState<File | null>(null)
  const [charmPreview, setCharmPreview] = useState<string | null>(null)

  function show(result: Result<unknown>, success?: string) {
    if (!result.ok) {
      setNotice({ type: 'error', text: result.error })
      if (result.error.startsWith('Sesi admin')) setIsAuth(false)
      return false
    }
    if (success) setNotice({ type: 'ok', text: success })
    return true
  }

  async function run<T>(action: () => Promise<Result<T>>, success?: string) {
    setBusy(true)
    try {
      const result = await action()
      return show(result, success) ? result : null
    } finally {
      setBusy(false)
    }
  }

  async function refresh() {
    const result = await loadAdminData()
    if (!show(result) || !result.ok) return
    const { settings: s, orders: o, packages: p, charms: c } = result.data
    setSettings(s)
    setOrders(o)
    setPackages(p)
    setCharms(c)
    setPrices(priceDraftFrom(s, p, c))
    setGeneral(settingsDraftFrom(s))
  }

  useEffect(() => {
    hasSession().then(async ok => {
      setIsAuth(ok)
      if (ok) await refresh()
      setLoading(false)
    })
    // refresh only needs to run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 4000)
    return () => clearTimeout(timer)
  }, [notice])

  async function handleLogin() {
    setBusy(true)
    const result = await login(password)
    setBusy(false)
    if (!show(result)) return
    setPassword('')
    setIsAuth(true)
    setLoading(true)
    await refresh()
    setLoading(false)
  }

  async function handleLogout() {
    await logout()
    setIsAuth(false)
  }

  async function changeStatus(orderId: string, status: string) {
    if (await run(() => updateOrderStatus(orderId, status))) {
      setOrders(prev => prev.map(o => (o.id === orderId ? { ...o, status } : o)))
    }
  }

  async function handleSavePrices() {
    const ok = await run(() => savePrices({
      unit: Object.fromEntries(UNIT_PRICES.map(u => [u.key, toNumber(prices.unit[u.key])])) as Record<UnitKey, number | null>,
      packages: Object.entries(prices.packages).map(([id, p]) => {
        const count = toNumber(p.included_charms) ?? 0
        const custom = isCustomPackage(packages.find(pkg => pkg.id === id))
        return { id, price: toNumber(p.price) ?? 0, included_charms: custom ? 0 : count, included_custom_charms: custom ? count : 0 }
      }),
      charms: Object.entries(prices.charms).map(([id, value]) => ({ id, price: toNumber(value) })),
    }), 'Harga disimpan.')
    if (ok) await refresh()
  }

  async function handleSaveGeneral() {
    const ok = await run(() => saveGeneralSettings({
      batch_label: general.batch_label,
      slot_count: Number(general.slot_count),
      whatsapp_number: general.whatsapp_number,
      pickup_options: general.pickup_options.split('\n'),
      keychain_shapes: general.keychain_shapes,
      instagram_username: general.instagram_username,
      tiktok_username: general.tiktok_username,
    }), 'Pengaturan disimpan.')
    if (ok) await refresh()
  }

  function pickQr(file: File | undefined) {
    if (!file) return
    if (!file.type.startsWith('image/')) return setNotice({ type: 'error', text: 'File QR harus berupa gambar.' })
    if (file.size > MAX_QR_BYTES) return setNotice({ type: 'error', text: 'Ukuran gambar QR maksimal 5 MB.' })
    if (qrPreview) URL.revokeObjectURL(qrPreview)
    setQrFile(file)
    setQrPreview(URL.createObjectURL(file))
  }

  function clearQrSelection() {
    if (qrPreview) URL.revokeObjectURL(qrPreview)
    setQrFile(null)
    setQrPreview(null)
  }

  async function uploadQr() {
    if (!qrFile) return
    setBusy(true)
    try {
      const ticket = await createQrisUpload(qrFile.name.split('.').pop() ?? 'png')
      if (!show(ticket) || !ticket.ok) return
      const { error } = await supabase.storage
        .from(UPLOAD_BUCKET)
        .uploadToSignedUrl(ticket.data.path, ticket.data.token, qrFile, { contentType: qrFile.type })
      if (error) return setNotice({ type: 'error', text: `Upload gagal: ${error.message}` })
      const saved = await setQrisImage(ticket.data.path)
      if (!show(saved, 'QR pembayaran diperbarui.') || !saved.ok) return
      setSettings(prev => (prev ? { ...prev, qris_image_url: saved.data } : prev))
      clearQrSelection()
    } finally {
      setBusy(false)
    }
  }

  async function removeQr() {
    if (!confirm('Hapus QR pembayaran? Form akan memakai /assets/qris.png kalau ada.')) return
    const result = await run(() => setQrisImage(null), 'QR pembayaran dihapus.')
    if (result) setSettings(prev => (prev ? { ...prev, qris_image_url: null } : prev))
  }

  async function handleSavePackage() {
    if (!editingPkg) return
    if (await run(() => savePackage(editingPkg), 'Paket disimpan.')) {
      setEditingPkg(null)
      await refresh()
    }
  }

  async function handleDeletePackage(id: string) {
    if (!confirm('Hapus paket ini?')) return
    if (await run(() => deletePackage(id), 'Paket dihapus.')) await refresh()
  }

  function pickCharmImage(file: File | undefined) {
    if (!file) return
    if (!file.type.startsWith('image/')) return setNotice({ type: 'error', text: 'File charm harus berupa gambar.' })
    if (file.size > MAX_QR_BYTES) return setNotice({ type: 'error', text: 'Ukuran gambar charm maksimal 5 MB.' })
    if (charmPreview) URL.revokeObjectURL(charmPreview)
    setCharmFile(file)
    setCharmPreview(URL.createObjectURL(file))
  }

  function closeCharmEditor() {
    if (charmPreview) URL.revokeObjectURL(charmPreview)
    setCharmFile(null)
    setCharmPreview(null)
    setEditingCharm(null)
  }

  async function handleSaveCharm() {
    if (!editingCharm) return
    let charm = editingCharm
    if (charmFile) {
      setBusy(true)
      try {
        const ticket = await createCharmUpload(charmFile.name.split('.').pop() ?? 'png')
        if (!show(ticket) || !ticket.ok) return
        const { error } = await supabase.storage
          .from(UPLOAD_BUCKET)
          .uploadToSignedUrl(ticket.data.path, ticket.data.token, charmFile, { contentType: charmFile.type })
        if (error) return setNotice({ type: 'error', text: `Upload gagal: ${error.message}` })
        // The uploaded picture replaces any catalog number so it is the one shown.
        charm = { ...charm, image_url: ticket.data.url, catalog_index: null }
      } finally {
        setBusy(false)
      }
    }
    if (await run(() => saveCharm(charm), 'Charm disimpan.')) {
      closeCharmEditor()
      await refresh()
    }
  }

  async function handleDeleteCharm(id: string) {
    if (!confirm('Hapus charm ini?')) return
    if (await run(() => deleteCharm(id), 'Charm dihapus.')) {
      closeCharmEditor()
      await refresh()
    }
  }

  async function handleImportDefaults() {
    const result = await run(() => importDefaultCatalog())
    if (!result?.ok) return
    const { packages: p, charms: c } = result.data
    setNotice({
      type: 'ok',
      text: p || c ? `Data bawaan dimasukkan: ${p} paket, ${c} charm.` : 'Database sudah berisi data, tidak ada yang ditambahkan.',
    })
    await refresh()
  }

  async function handleSaveOrder() {
    if (!editingOrder) return
    if (await run(() => saveOrder(editingOrder), 'Pesanan disimpan.')) {
      setEditingOrder(null)
      await refresh()
    }
  }

  async function handleDeleteOrder(order: Order) {
    if (!confirm(`Hapus pesanan ${order.order_code || order.customer_name}? Ini tidak bisa dibatalkan.`)) return
    if (await run(() => deleteOrder(order.id), 'Pesanan dihapus.')) {
      setOrders(prev => prev.filter(o => o.id !== order.id))
    }
  }

  function handleExportOrders() {
    const stamp = new Date().toISOString().slice(0, 10)
    downloadFile(`pesanan-charmera-${stamp}.csv`, ordersToCsv(orders))
  }

  async function handleImportOrders(file: File | undefined) {
    if (!file) return
    let parsed: ReturnType<typeof csvToOrders>
    try {
      parsed = csvToOrders(await file.text())
    } catch (error) {
      return setNotice({ type: 'error', text: error instanceof Error ? error.message : 'File CSV tidak bisa dibaca.' })
    }
    if (parsed.rows.length === 0) return setNotice({ type: 'error', text: 'Tidak ada baris pesanan yang bisa diimpor.' })
    if (!confirm(`Impor ${parsed.rows.length} pesanan dari ${file.name}? Pesanan dengan kode yang sama akan diperbarui.`)) return

    setBusy(true)
    let added = 0
    let updated = 0
    try {
      for (let i = 0; i < parsed.rows.length; i += IMPORT_CHUNK) {
        const result = await importOrders(parsed.rows.slice(i, i + IMPORT_CHUNK))
        if (!show(result) || !result.ok) return
        added += result.data.added
        updated += result.data.updated
      }
      const skipped = parsed.skipped ? `, ${parsed.skipped} baris tanpa nama dilewati` : ''
      setNotice({ type: 'ok', text: `Impor selesai: ${added} ditambah, ${updated} diperbarui${skipped}.` })
    } finally {
      setBusy(false)
      await refresh()
    }
  }

  const noticeBanner = notice && (
    <div
      role={notice.type === 'error' ? 'alert' : 'status'}
      className={`fixed bottom-4 left-1/2 z-60 -translate-x-1/2 rounded-xl px-4 py-3 text-sm font-semibold shadow-lg ${
        notice.type === 'error' ? 'bg-cherry text-cream' : 'bg-char text-cream'
      }`}
    >
      {notice.text}
    </div>
  )

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-cherry border-t-transparent" />
      </div>
    )
  }

  if (!isAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream p-4">
        <form
          className="bg-card rounded-2xl p-8 border border-line shadow-lg w-full max-w-sm"
          onSubmit={e => {
            e.preventDefault()
            handleLogin()
          }}
        >
          <h1 className="font-display text-2xl font-semibold text-center mb-6">Admin Login</h1>
          <input
            type="password"
            placeholder="Password"
            autoComplete="current-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className={`${inputClass} mb-4`}
          />
          <button
            type="submit"
            disabled={busy || !password}
            className="w-full py-3 bg-cherry text-cream font-bold rounded-full hover:bg-cherry/90 transition-all disabled:opacity-50"
          >
            {busy ? 'Memeriksa…' : 'Masuk'}
          </button>
        </form>
        {noticeBanner}
      </div>
    )
  }

  const unitFallbacks = Object.fromEntries(UNIT_PRICES.map(u => [u.key, u.fallback])) as Record<UnitKey, number>
  const defaultCharmPrice = toNumber(prices.unit.charm_price) ?? unitFallbacks.charm_price
  const currentQr = qrPreview ?? settings?.qris_image_url ?? null
  const usingDefaultPackages = packages.length === 0
  const usingDefaultCharms = !charms.some(c => c.image_url || c.catalog_index)
  const defaultsBanner = (usingDefaultPackages || usingDefaultCharms) && (
    <div className="rounded-2xl border-2 border-dashed border-cherry bg-butter/40 p-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm max-w-xl">
        Form pelanggan sekarang menampilkan data bawaan
        {usingDefaultPackages && usingDefaultCharms ? ' (3 paket contoh dan 64 charm katalog)' : usingDefaultPackages ? ' (3 paket contoh)' : ' (64 charm katalog)'}
        {' '}yang belum ada di database. Masukkan ke database supaya bisa diedit, dinonaktifkan, atau dihapus dari sini.
      </p>
      <button
        onClick={handleImportDefaults}
        disabled={busy}
        className="px-4 py-2 bg-cherry text-cream font-semibold rounded-full hover:bg-cherry/90 transition-all disabled:opacity-50"
      >
        Masukkan data bawaan
      </button>
    </div>
  )

  return (
    <div className="min-h-screen bg-cream">
      <header className="bg-char text-cream py-6 px-6">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <h1 className="font-display text-2xl font-semibold">Charmera Admin</h1>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-cream/20 rounded-full text-sm hover:bg-cream/30 transition-all"
          >
            Logout
          </button>
        </div>
      </header>

      <nav className="bg-card border-b border-line sticky top-0 z-10">
        <div className="max-w-6xl mx-auto flex gap-1 p-2 overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-full font-semibold whitespace-nowrap transition-all ${
                tab === t.id ? 'bg-cherry text-cream' : 'hover:bg-rose/30'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      <main className="max-w-6xl mx-auto p-4 md:p-6">
        {tab === 'orders' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {ORDER_STATUSES.map(status => (
                <div key={status} className="bg-card rounded-xl p-4 border border-line text-center">
                  <p className="text-3xl font-bold text-cherry">
                    {orders.filter(o => o.status === status).length}
                  </p>
                  <p className="text-sm text-char/70">{status}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-char/70">{orders.length} pesanan</p>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => downloadFile('template-pesanan-charmera.csv', orderTemplateCsv())} className={secondaryButton}>
                  Template CSV
                </button>
                <label className={`${secondaryButton} cursor-pointer ${busy ? 'pointer-events-none opacity-50' : ''}`}>
                  {busy ? 'Memproses…' : 'Impor CSV'}
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    hidden
                    onChange={e => {
                      handleImportOrders(e.target.files?.[0])
                      e.target.value = ''
                    }}
                  />
                </label>
                <button onClick={handleExportOrders} disabled={orders.length === 0} className={`${secondaryButton} disabled:opacity-50`}>
                  Ekspor CSV
                </button>
                <button
                  onClick={() => setEditingOrder({ customer_name: '', status: ORDER_STATUSES[0], quantity: 1, total_price: 0 })}
                  className="px-4 py-2 bg-cherry text-cream font-semibold rounded-full hover:bg-cherry/90 transition-all"
                >
                  + Tambah Pesanan
                </button>
              </div>
            </div>
            <p className="text-xs text-char/60">
              Impor menambah pesanan dari file CSV (bisa dari Excel). Kolom wajib: Nama. Baris dengan Kode yang sudah ada akan memperbarui pesanan itu.
              Pakai Template CSV atau hasil Ekspor sebagai contoh format.
            </p>

            <div className="bg-card rounded-2xl border border-line overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-rose/30">
                    <tr>
                      <th className="text-left p-3">ID</th>
                      <th className="text-left p-3">Paket</th>
                      <th className="text-left p-3">Nama</th>
                      <th className="text-left p-3">WA</th>
                      <th className="text-left p-3">Qty</th>
                      <th className="text-left p-3">Total</th>
                      <th className="text-left p-3">Status</th>
                      <th className="text-left p-3">Tanggal</th>
                      <th className="p-3"><span className="sr-only">Aksi</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.length === 0 && (
                      <tr><td colSpan={9} className="p-6 text-center text-char/60">Belum ada pesanan.</td></tr>
                    )}
                    {orders.map(order => (
                      <Fragment key={order.id}>
                        <tr className="border-t border-line hover:bg-rose/10">
                          <td className="p-3 font-mono text-xs">
                            <button
                              onClick={() => setOpenOrder(openOrder === order.id ? null : order.id)}
                              className="underline"
                              aria-expanded={openOrder === order.id}
                            >
                              {order.order_code || order.id.slice(0, 8)}
                            </button>
                          </td>
                          <td className="p-3">{order.package_name}</td>
                          <td className="p-3">{order.customer_name}</td>
                          <td className="p-3">{order.customer_whatsapp}</td>
                          <td className="p-3">{order.quantity}</td>
                          <td className="p-3 font-semibold">Rp {order.total_price.toLocaleString('id')}</td>
                          <td className="p-3">
                            <select
                              value={order.status}
                              onChange={e => changeStatus(order.id, e.target.value)}
                              className="px-2 py-1 rounded-lg border border-line bg-cream text-sm"
                            >
                              {ORDER_STATUSES.map(s => (
                                <option key={s} value={s}>{s}</option>
                              ))}
                            </select>
                          </td>
                          <td className="p-3 text-xs text-char/70">
                            {new Date(order.created_at).toLocaleDateString('id')}
                          </td>
                          <td className="p-3">
                            <div className="flex justify-end gap-1">
                              <button onClick={() => setEditingOrder({ ...order, pickup_method: order.pickup_method || order.customer_address })}className="px-3 py-1 text-xs bg-sky/30 rounded-full hover:bg-sky/50">
                                Edit
                              </button>
                              <button onClick={() => handleDeleteOrder(order)} className="px-3 py-1 text-xs bg-rose/50 rounded-full hover:bg-rose">
                                Hapus
                              </button>
                            </div>
                          </td>
                        </tr>
                        {openOrder === order.id && (
                          <tr className="bg-cream/60">
                            <td colSpan={9} className="p-4">
                              <OrderDetails order={order} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {editingOrder && (
              <div className="fixed inset-0 bg-char/50 flex items-center justify-center p-4 z-50">
                <form
                  className="bg-card rounded-2xl p-6 w-full max-w-lg border border-line max-h-full overflow-y-auto"
                  onSubmit={e => {
                    e.preventDefault()
                    handleSaveOrder()
                  }}
                >
                  <h3 className="font-display text-xl font-semibold mb-4">
                    {editingOrder.id ? `Edit Pesanan ${editingOrder.order_code ?? ''}` : 'Tambah Pesanan'}
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {([
                      ['order_code', 'Kode pesanan', 'text', 'Kosongkan untuk dibuat otomatis'],
                      ['customer_name', 'Nama', 'text', ''],
                      ['customer_whatsapp', 'WhatsApp', 'tel', '08xxxxxxxxxx'],
                      ['customer_email', 'Email', 'email', ''],
                      ['customer_instagram', 'Instagram', 'text', '@username'],
                      ['pickup_method', 'Pengambilan', 'text', ''],
                      ['package_name', 'Pesanan', 'text', 'Italian Charm (Daily Set)'],
                    ] as const).map(([key, label, type, placeholder]) => (
                      <label key={key} className={`block text-sm ${key === 'package_name' ? 'sm:col-span-2' : ''}`}>
                        {label}
                        <input
                          type={type}
                          placeholder={placeholder}
                          disabled={key === 'order_code' && Boolean(editingOrder.id)}
                          required={key === 'customer_name'}
                          value={editingOrder[key] ?? ''}
                          onChange={e => setEditingOrder(prev => (prev ? { ...prev, [key]: e.target.value } : null))}
                          className={`mt-1 ${inputClass} disabled:opacity-60`}
                        />
                      </label>
                    ))}
                    <label className="block text-sm">
                      Qty
                      <input
                        type="number"
                        min={1}
                        value={editingOrder.quantity ?? 1}
                        onChange={e => setEditingOrder(prev => (prev ? { ...prev, quantity: parseInt(e.target.value) || 1 } : null))}
                        className={`mt-1 ${inputClass}`}
                      />
                    </label>
                    <label className="block text-sm">
                      Total
                      <PriceInput
                        label="Total"
                        value={toText(editingOrder.total_price)}
                        onChange={value => setEditingOrder(prev => (prev ? { ...prev, total_price: toNumber(value) ?? 0 } : null))}
                      />
                    </label>
                    <label className="block text-sm sm:col-span-2">
                      Status
                      <select
                        value={editingOrder.status ?? ORDER_STATUSES[0]}
                        onChange={e => setEditingOrder(prev => (prev ? { ...prev, status: e.target.value } : null))}
                        className={`mt-1 ${inputClass}`}
                      >
                        {ORDER_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </label>
                    <label className="block text-sm sm:col-span-2">
                      Catatan
                      <textarea
                        rows={2}
                        value={editingOrder.notes ?? ''}
                        onChange={e => setEditingOrder(prev => (prev ? { ...prev, notes: e.target.value } : null))}
                        className={`mt-1 ${inputClass} resize-none`}
                      />
                    </label>
                  </div>
                  <div className="flex gap-2 mt-6">
                    <button
                      type="button"
                      onClick={() => setEditingOrder(null)}
                      className="flex-1 py-3 bg-char/10 rounded-full font-semibold hover:bg-char/20 transition-all"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      disabled={busy}
                      className="flex-1 py-3 bg-cherry text-cream font-semibold rounded-full hover:bg-cherry/90 transition-all disabled:opacity-50"
                    >
                      Simpan
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        )}

        {tab === 'prices' && (
          <form
            className="space-y-6 max-w-4xl"
            onSubmit={e => {
              e.preventDefault()
              handleSavePrices()
            }}
          >
            <section className="bg-card rounded-2xl p-6 border border-line">
              <h2 className="font-display text-xl font-semibold">Harga satuan</h2>
              <p className="text-sm text-char/70 mb-4">Kosongkan untuk memakai harga bawaan.</p>
              <div className="grid gap-4 sm:grid-cols-2">
                {UNIT_PRICES.map(u => (
                  <label key={u.key} className="block">
                    <span className="block font-semibold">{u.label}</span>
                    <span className="block text-xs text-char/60 mb-2">{u.hint}</span>
                    <PriceInput
                      label={u.label}
                      value={prices.unit[u.key]}
                      placeholder={String(u.fallback)}
                      onChange={value => setPrices(prev => ({ ...prev, unit: { ...prev.unit, [u.key]: value } }))}
                    />
                  </label>
                ))}
              </div>
            </section>

            <section className="bg-card rounded-2xl p-6 border border-line">
              <h2 className="font-display text-xl font-semibold">Harga set gelang</h2>
              <p className="text-sm text-char/70 mb-4">
                Harga set sudah termasuk gelang dan sejumlah charm biasa. Charm di luar jatah dihitung per charm.
              </p>
              {packages.length === 0 ? (
                <p className="text-sm text-char/60">Belum ada paket. Tambahkan di tab Paket.</p>
              ) : (
                <div className="divide-y divide-line">
                  {packages.map(pkg => (
                    <div key={pkg.id} className="grid gap-3 py-4 sm:grid-cols-[1fr_200px_160px] sm:items-end">
                      <div>
                        <p className="font-semibold">
                          {pkg.name}
                          {!pkg.is_active && <span className="ml-2 rounded-full bg-char/10 px-2 py-0.5 text-xs">Nonaktif</span>}
                        </p>
                        {pkg.items?.length ? <p className="text-xs text-char/60">{pkg.items.join(' · ')}</p> : null}
                      </div>
                      <label className="block text-sm">
                        Harga set
                        <PriceInput
                          label={`Harga ${pkg.name}`}
                          value={prices.packages[pkg.id]?.price ?? ''}
                          onChange={value => setPrices(prev => ({
                            ...prev,
                            packages: { ...prev.packages, [pkg.id]: { ...prev.packages[pkg.id], price: value } },
                          }))}
                        />
                      </label>
                      <label className="block text-sm">
                        Charm {isCustomPackage(pkg) ? 'custom' : 'non-custom'} termasuk
                        <input
                          type="number"
                          min={0}
                          value={prices.packages[pkg.id]?.included_charms ?? ''}
                          onChange={e => {
                            const value = e.target.value
                            setPrices(prev => ({
                              ...prev,
                              packages: { ...prev.packages, [pkg.id]: { ...prev.packages[pkg.id], included_charms: value } },
                            }))
                          }}
                          className={inputClass}
                        />
                      </label>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="bg-card rounded-2xl p-6 border border-line">
              <h2 className="font-display text-xl font-semibold">Harga khusus per charm</h2>
              <p className="text-sm text-char/70 mb-4">
                Isi hanya untuk charm yang harganya beda. Kosong berarti ikut harga charm biasa (Rp {defaultCharmPrice.toLocaleString('id')}).
              </p>
              {charms.length === 0 ? (
                <p className="text-sm text-char/60">
                  Belum ada charm di database, jadi form memakai 64 charm katalog bawaan dengan harga charm biasa.
                  Klik tombol Masukkan data bawaan di tab Charm untuk memberi harga khusus.
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {charms.map(charm => {
                    const image = charm.image_url || (charm.catalog_index ? `/charms/catalog-${String(charm.catalog_index).padStart(2, '0')}.webp` : null)
                    return (
                      <div key={charm.id} className="flex items-center gap-3 rounded-xl border border-line p-3">
                        <div className="grid h-12 w-14 flex-none place-items-center rounded-lg bg-cream text-2xl">
                          {image ? <img src={image} alt="" className="h-full w-full object-contain" /> : charm.emoji}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{charm.name || 'Tanpa nama'}</p>
                          <PriceInput
                            label={`Harga ${charm.name || 'charm'}`}
                            value={prices.charms[charm.id] ?? ''}
                            placeholder={String(defaultCharmPrice)}
                            onChange={value => setPrices(prev => ({ ...prev, charms: { ...prev.charms, [charm.id]: value } }))}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>

            <div className="sticky bottom-4 flex justify-end">
              <button
                type="submit"
                disabled={busy}
                className="px-8 py-3 bg-cherry text-cream font-bold rounded-full shadow-lg hover:bg-cherry/90 transition-all disabled:opacity-50"
              >
                {busy ? 'Menyimpan…' : 'Simpan semua harga'}
              </button>
            </div>
          </form>
        )}

        {tab === 'packages' && (
          <div className="space-y-4">
            {usingDefaultPackages && defaultsBanner}
            <div className="flex justify-end">
              <button
                onClick={() => setEditingPkg({
                  name: '', price: 0, items: [], bracelet_count: 1, included_charms: 0, included_custom_charms: 0, included_keychains: 0, is_active: true,
                })}
                className="px-4 py-2 bg-cherry text-cream font-semibold rounded-full hover:bg-cherry/90 transition-all"
              >
                + Tambah Paket
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {packages.map(pkg => (
                <div key={pkg.id} className="bg-card rounded-xl p-4 border border-line">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-semibold text-lg">{pkg.name}</h3>
                      <p className="text-cherry font-bold">Rp {pkg.price.toLocaleString('id')}</p>
                      <p className="text-sm text-char/70 mt-1">{packageItems(pkg).join(' · ')}</p>
                      {pkg.description && <p className="text-xs text-char/60 mt-1 line-clamp-2">{pkg.description}</p>}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setEditingPkg(pkg)} className="px-3 py-1 text-sm bg-sky/30 rounded-full hover:bg-sky/50">
                        Edit
                      </button>
                      <button onClick={() => handleDeletePackage(pkg.id)} className="px-3 py-1 text-sm bg-rose/50 rounded-full hover:bg-rose">
                        Hapus
                      </button>
                    </div>
                  </div>
                  {!pkg.is_active && (
                    <span className="inline-block mt-2 px-2 py-1 text-xs bg-char/10 rounded-full">Nonaktif</span>
                  )}
                </div>
              ))}
            </div>

            {editingPkg && (
              <div className="fixed inset-0 bg-char/50 flex items-center justify-center p-4 z-50">
                <div className="bg-card rounded-2xl p-6 w-full max-w-md border border-line max-h-full overflow-y-auto">
                  <h3 className="font-display text-xl font-semibold mb-4">
                    {editingPkg.id ? 'Edit Paket' : 'Tambah Paket'}
                  </h3>
                  <div className="space-y-4">
                    <input
                      type="text"
                      placeholder="Nama paket"
                      value={editingPkg.name || ''}
                      onChange={e => setEditingPkg(prev => prev ? { ...prev, name: e.target.value } : null)}
                      className={inputClass}
                    />
                    <label className="block text-sm">
                      Harga set
                      <PriceInput
                        label="Harga set"
                        value={toText(editingPkg.price)}
                        onChange={value => setEditingPkg(prev => prev ? { ...prev, price: toNumber(value) ?? 0 } : null)}
                      />
                    </label>
                    <PackageContentsEditor
                      pkg={editingPkg}
                      onChange={patch => setEditingPkg(prev => (prev ? { ...prev, ...patch } : null))}
                    />
                    <label className="block text-sm">
                      Deskripsi detail (tampil saat kartu paket di-flip)
                      <textarea
                        placeholder="Misal: Cocok untuk kado bertiga. Semua charm dari fotomu sendiri…"
                        value={editingPkg.description || ''}
                        onChange={e => setEditingPkg(prev => prev ? { ...prev, description: e.target.value } : null)}
                        className={`mt-1 ${inputClass} resize-none`}
                        rows={4}
                      />
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={editingPkg.is_active ?? true}
                        onChange={e => setEditingPkg(prev => prev ? { ...prev, is_active: e.target.checked } : null)}
                        className="accent-cherry"
                      />
                      <span>Aktif</span>
                    </label>
                  </div>
                  <div className="flex gap-2 mt-6">
                    <button
                      onClick={() => setEditingPkg(null)}
                      className="flex-1 py-3 bg-char/10 rounded-full font-semibold hover:bg-char/20 transition-all"
                    >
                      Batal
                    </button>
                    <button
                      onClick={handleSavePackage}
                      disabled={busy}
                      className="flex-1 py-3 bg-cherry text-cream font-semibold rounded-full hover:bg-cherry/90 transition-all disabled:opacity-50"
                    >
                      Simpan
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'charms' && (
          <div className="space-y-4">
            {usingDefaultCharms && defaultsBanner}
            <div className="flex justify-end">
              <button
                onClick={() => setEditingCharm({ emoji: '', sort_order: 0, is_active: true })}
                className="px-4 py-2 bg-cherry text-cream font-semibold rounded-full hover:bg-cherry/90 transition-all"
              >
                + Tambah Charm
              </button>
            </div>

            <div className="bg-card rounded-2xl border border-line p-4">
              {charms.length === 0 && <p className="text-sm text-char/60">Belum ada charm di database.</p>}
              {charms.length > 0 && <p className="text-xs text-char/60 mb-3">Klik charm untuk mengedit atau menghapus.</p>}
              <div className="flex flex-wrap gap-3">
                {charms.map(charm => (
                  <button
                    key={charm.id}
                    onClick={() => setEditingCharm(charm)}
                    className="w-16 rounded-xl hover:ring-2 hover:ring-cherry focus-visible:ring-2 focus-visible:ring-cherry"
                    aria-label={`Edit ${charm.name || 'charm'}`}
                  >
                    <div
                      className={`relative w-16 h-16 rounded-xl text-3xl flex items-center justify-center ${
                        charm.is_active ? 'bg-rose' : 'bg-char/10 opacity-50'
                      }`}
                    >
                      {charm.image_url || charm.catalog_index ? (
                        <img
                          src={charm.image_url || `/charms/catalog-${String(charm.catalog_index).padStart(2, '0')}.webp`}
                          alt={charm.name || 'Charm'}
                          className="w-full h-full object-contain"
                        />
                      ) : charm.emoji}
                      {!charm.is_active && (
                        <span className="absolute bottom-0.5 rounded-full bg-char px-1.5 text-[9px] font-semibold text-cream">Nonaktif</span>
                      )}
                    </div>
                    {charm.name && <span className="block text-xs text-center mt-1 text-char/70 truncate">{charm.name}</span>}
                    {charm.price != null && (
                      <span className="block text-[10px] text-center text-cherry font-semibold">Rp {charm.price.toLocaleString('id')}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {editingCharm && (
              <div className="fixed inset-0 bg-char/50 flex items-center justify-center p-4 z-50">
                <div className="bg-card rounded-2xl p-6 w-full max-w-sm border border-line">
                  <h3 className="font-display text-xl font-semibold mb-4">
                    {editingCharm.id ? 'Edit Charm' : 'Tambah Charm'}
                  </h3>
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-line bg-rose flex items-center justify-center text-3xl">
                        {charmPreview || editingCharm.image_url || editingCharm.catalog_index ? (
                          <img
                            src={charmPreview || editingCharm.image_url || `/charms/catalog-${String(editingCharm.catalog_index).padStart(2, '0')}.webp`}
                            alt="Gambar charm"
                            className="h-full w-full object-contain"
                          />
                        ) : editingCharm.emoji || '?'}
                      </div>
                      <div className="min-w-0 text-sm">
                        <label className={`${secondaryButton} cursor-pointer inline-block`}>
                          {charmPreview ? 'Ganti gambar' : 'Upload gambar'}
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={e => {
                              pickCharmImage(e.target.files?.[0])
                              e.target.value = ''
                            }}
                          />
                        </label>
                        <p className="mt-1 text-xs text-char/60">
                          {charmFile ? `${charmFile.name} (diupload saat Simpan)` : 'Satu gambar per charm, maks 5 MB. PNG transparan paling bagus.'}
                        </p>
                      </div>
                    </div>
                    <input
                      type="text"
                      placeholder="Nama (opsional)"
                      value={editingCharm.name || ''}
                      onChange={e => setEditingCharm(prev => prev ? { ...prev, name: e.target.value } : null)}
                      className={inputClass}
                    />
                    <input
                      type="url"
                      placeholder="URL gambar charm (opsional)"
                      value={editingCharm.image_url || ''}
                      onChange={e => setEditingCharm(prev => prev ? { ...prev, image_url: e.target.value } : null)}
                      className={inputClass}
                    />
                    <input
                      type="number"
                      min={1}
                      placeholder="Nomor di katalog bawaan (1-64, opsional)"
                      value={editingCharm.catalog_index || ''}
                      onChange={e => setEditingCharm(prev => prev ? { ...prev, catalog_index: parseInt(e.target.value) || null } : null)}
                      className={inputClass}
                    />
                    <input
                      type="text"
                      placeholder="Emoji (opsional)"
                      value={editingCharm.emoji || ''}
                      onChange={e => setEditingCharm(prev => prev ? { ...prev, emoji: e.target.value } : null)}
                      className={inputClass}
                    />
                    <label className="block text-sm">
                      Harga khusus (kosongkan untuk harga charm biasa)
                      <PriceInput
                        label="Harga khusus"
                        value={toText(editingCharm.price)}
                        placeholder={String(defaultCharmPrice)}
                        onChange={value => setEditingCharm(prev => prev ? { ...prev, price: toNumber(value) } : null)}
                      />
                    </label>
                    <input
                      type="number"
                      placeholder="Urutan"
                      value={editingCharm.sort_order || 0}
                      onChange={e => setEditingCharm(prev => prev ? { ...prev, sort_order: parseInt(e.target.value) || 0 } : null)}
                      className={inputClass}
                    />
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={editingCharm.is_active ?? true}
                        onChange={e => setEditingCharm(prev => prev ? { ...prev, is_active: e.target.checked } : null)}
                        className="accent-cherry"
                      />
                      <span>Aktif</span>
                    </label>
                  </div>
                  <div className="flex gap-2 mt-6">
                    <button
                      onClick={closeCharmEditor}
                      className="flex-1 py-3 bg-char/10 rounded-full font-semibold hover:bg-char/20 transition-all"
                    >
                      Batal
                    </button>
                    <button
                      onClick={handleSaveCharm}
                      disabled={busy}
                      className="flex-1 py-3 bg-cherry text-cream font-semibold rounded-full hover:bg-cherry/90 transition-all disabled:opacity-50"
                    >
                      Simpan
                    </button>
                  </div>
                  {editingCharm.id && (
                    <button
                      onClick={() => handleDeleteCharm(editingCharm.id!)}
                      disabled={busy}
                      className="mt-3 w-full py-2 text-sm font-semibold text-cherry underline disabled:opacity-50"
                    >
                      Hapus charm ini
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'settings' && (
          <div className="grid gap-6 lg:grid-cols-2 items-start">
            <section className="bg-card rounded-2xl p-6 border border-line space-y-5">
              <h2 className="font-display text-xl font-semibold">QR pembayaran</h2>
              <div className="grid place-items-center rounded-2xl border-2 border-dashed border-line bg-cream p-4">
                {currentQr ? (
                  <img src={currentQr} alt="QR pembayaran" className="max-h-72 w-auto rounded-lg bg-white" />
                ) : (
                  <p className="py-16 text-center text-sm text-char/60">
                    Belum ada QR. Form akan memakai /assets/qris.png kalau ada,
                    atau menampilkan pesan bahwa info pembayaran dikirim lewat WhatsApp.
                  </p>
                )}
              </div>
              {qrPreview && <p className="text-sm text-cherry font-semibold text-center">Preview, belum disimpan.</p>}
              <div className="flex flex-wrap gap-2">
                <label className="cursor-pointer px-4 py-2 rounded-full border-2 border-cherry text-cherry font-semibold hover:bg-rose/30">
                  {currentQr ? 'Pilih gambar lain' : 'Pilih gambar QR'}
                  <input
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={e => {
                      pickQr(e.target.files?.[0])
                      e.target.value = ''
                    }}
                  />
                </label>
                {qrFile && (
                  <>
                    <button
                      onClick={uploadQr}
                      disabled={busy}
                      className="px-4 py-2 bg-cherry text-cream font-semibold rounded-full hover:bg-cherry/90 disabled:opacity-50"
                    >
                      {busy ? 'Mengupload…' : 'Simpan QR'}
                    </button>
                    <button onClick={clearQrSelection} className="px-4 py-2 rounded-full bg-char/10 font-semibold hover:bg-char/20">
                      Batal
                    </button>
                  </>
                )}
                {!qrFile && settings?.qris_image_url && (
                  <button onClick={removeQr} disabled={busy} className="px-4 py-2 rounded-full bg-rose/60 font-semibold hover:bg-rose">
                    Hapus QR
                  </button>
                )}
              </div>
              <p className="text-xs text-char/60">JPG atau PNG, maksimal 5 MB. Pastikan QR terlihat jelas dan tidak terpotong.</p>
            </section>

            <form
              className="bg-card rounded-2xl p-6 border border-line space-y-5"
              onSubmit={e => {
                e.preventDefault()
                handleSaveGeneral()
              }}
            >
              <h2 className="font-display text-xl font-semibold">Umum</h2>
              <label className="block">
                <span className="block font-medium mb-2">Judul batch</span>
                <input
                  type="text"
                  placeholder={DEFAULT_CONFIG.batchLabel}
                  value={general.batch_label}
                  onChange={e => setGeneral(prev => ({ ...prev, batch_label: e.target.value }))}
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className="block font-medium mb-2">Jumlah slot gelang</span>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={general.slot_count}
                  onChange={e => setGeneral(prev => ({ ...prev, slot_count: e.target.value }))}
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className="block font-medium mb-2">Nomor WhatsApp admin</span>
                <input
                  type="tel"
                  placeholder="628123456789"
                  value={general.whatsapp_number}
                  onChange={e => setGeneral(prev => ({ ...prev, whatsapp_number: e.target.value }))}
                  className={inputClass}
                />
                <span className="block text-xs text-char/60 mt-1">Dipakai tombol konfirmasi pembayaran di halaman terima kasih.</span>
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="block font-medium mb-2">Username Instagram</span>
                  <input
                    type="text"
                    autoCapitalize="none"
                    placeholder="@charmera"
                    value={general.instagram_username}
                    onChange={e => setGeneral(prev => ({ ...prev, instagram_username: e.target.value }))}
                    className={inputClass}
                  />
                </label>
                <label className="block">
                  <span className="block font-medium mb-2">Username TikTok</span>
                  <input
                    type="text"
                    autoCapitalize="none"
                    placeholder="@charmera"
                    value={general.tiktok_username}
                    onChange={e => setGeneral(prev => ({ ...prev, tiktok_username: e.target.value }))}
                    className={inputClass}
                  />
                </label>
                <span className="block text-xs text-char/60 sm:col-span-2 -mt-2">
                  Ditampilkan di syarat garansi pada halaman terima kasih.
                </span>
              </div>
              <label className="block">
                <span className="block font-medium mb-2">Pilihan pengambilan (satu baris satu pilihan)</span>
                <textarea
                  rows={3}
                  value={general.pickup_options}
                  onChange={e => setGeneral(prev => ({ ...prev, pickup_options: e.target.value }))}
                  className={`${inputClass} resize-none`}
                />
              </label>
              <fieldset>
                <legend className="font-medium mb-1">Bentuk keychain custom</legend>
                <p className="text-xs text-char/60 mb-2">Bentuk yang nonaktif tidak bisa dipilih pelanggan. Minimal satu harus aktif.</p>
                <div className="flex flex-wrap gap-2">
                  {KEYCHAIN_SHAPE_IDS.map(shape => {
                    const active = general.keychain_shapes.includes(shape)
                    return (
                      <label
                        key={shape}
                        className={`flex cursor-pointer items-center gap-2 rounded-full border-2 px-4 py-2 font-semibold transition-all ${
                          active ? 'border-cherry bg-cherry text-cream' : 'border-line bg-cream text-char/60'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={active}
                          onChange={e => setGeneral(prev => ({
                            ...prev,
                            keychain_shapes: e.target.checked
                              ? KEYCHAIN_SHAPE_IDS.filter(s => s === shape || prev.keychain_shapes.includes(s))
                              : prev.keychain_shapes.filter(s => s !== shape),
                          }))}
                          className="accent-cream"
                        />
                        {SHAPE_LABEL[shape]}
                        <span className="text-xs font-normal">{active ? 'Aktif' : 'Nonaktif'}</span>
                      </label>
                    )
                  })}
                </div>
              </fieldset>
              <p className="text-xs text-char/60">Password admin diatur lewat variabel ADMIN_PASSWORD di environment.</p>
              <button
                type="submit"
                disabled={busy}
                className="w-full py-3 bg-cherry text-cream font-semibold rounded-full hover:bg-cherry/90 transition-all disabled:opacity-50"
              >
                {busy ? 'Menyimpan…' : 'Simpan Pengaturan'}
              </button>
            </form>
          </div>
        )}
      </main>
      {noticeBanner}
    </div>
  )
}
