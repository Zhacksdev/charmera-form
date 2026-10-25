/* eslint-disable react-hooks/set-state-in-effect */
'use client'

import { Fragment, useState, useEffect } from 'react'
import { supabase, supabaseAdmin, Package, Charm, Settings, Order } from '@/lib/supabase'

const ORDER_STATUSES = ['Menunggu verifikasi', 'Menunggu bayar', 'Terbayar', 'Diproses', 'Selesai']

type OrderItem = {
  type?: string
  package_name?: string
  shape?: string
  double_sided?: boolean
  quantity?: number
  subtotal?: number
  slots?: ({ position: number; kind: string; name?: string | null; photo_url?: string }| null)[]
  sides?: { side: string; print_url: string; original_url: string }[]
}

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
            {item.slots && (
              <ol className="mt-1 list-decimal pl-5">
                {item.slots.map((slot, i) => slot && (
                  <li key={i} value={slot.position}>
                    {slot.kind === 'custom'
                      ? <a href={slot.photo_url} target="_blank" rel="noreferrer" className="underline">Charm custom (foto)</a>
                      : slot.name}
                  </li>
                ))}
              </ol>
            )}
            {item.sides?.map(side => (
              <p key={side.side}>
                {side.side === 'back' ? 'Belakang' : 'Depan'}:{' '}
                <a href={side.print_url} target="_blank" rel="noreferrer" className="underline">siap cetak</a>{' · '}
                <a href={side.original_url} target="_blank" rel="noreferrer" className="underline">asli</a>
              </p>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function AdminPage() {
  const [isAuth, setIsAuth] = useState(false)
  const [password, setPassword] = useState('')
  const [settings, setSettings] = useState<Settings | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [packages, setPackages] = useState<Package[]>([])
  const [charms, setCharms] = useState<Charm[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'orders' | 'packages' | 'charms' | 'settings'>('orders')

  const [editingPkg, setEditingPkg] = useState<Partial<Package> | null>(null)
  const [editingCharm, setEditingCharm] = useState<Partial<Charm> | null>(null)
  const [openOrder, setOpenOrder] = useState<string | null>(null)

  async function loadData() {
    const [settingsRes, ordersRes, packagesRes, charmsRes] = await Promise.all([
      supabase.from('settings').select('*').limit(1).single(),
      supabaseAdmin.from('orders').select('*').order('created_at', { ascending: false }),
      supabaseAdmin.from('packages').select('*').order('created_at'),
      supabaseAdmin.from('charms').select('*').order('sort_order'),
    ])

    if (settingsRes.data) setSettings(settingsRes.data)
    if (ordersRes.data) setOrders(ordersRes.data)
    if (packagesRes.data) setPackages(packagesRes.data)
    if (charmsRes.data) setCharms(charmsRes.data)
    setLoading(false)
  }

  useEffect(() => {
    const auth = sessionStorage.getItem('adminAuth')
    if (auth === 'true') {
      setIsAuth(true)
      loadData()
    } else {
      setLoading(false)
    }
  }, [])

  function handleLogin() {
    if (password === (settings?.admin_password || 'admin123')) {
      sessionStorage.setItem('adminAuth', 'true')
      setIsAuth(true)
      loadData()
    } else {
      alert('Password salah')
    }
  }

  function handleLogout() {
    sessionStorage.removeItem('adminAuth')
    setIsAuth(false)
  }

  async function updateOrderStatus(orderId: string, status: string) {
    const { error } = await supabaseAdmin
      .from('orders')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', orderId)

    if (!error) {
      setOrders(prev => prev.map(o => (o.id === orderId ? { ...o, status } : o)))
    }
  }

  async function updateSettings() {
    if (!settings) return
    const { error } = await supabaseAdmin
      .from('settings')
      .update({
        slot_count: settings.slot_count,
        admin_password: settings.admin_password,
        whatsapp_number: settings.whatsapp_number,
        batch_label: settings.batch_label || null,
        charm_price: settings.charm_price ?? null,
        custom_charm_price: settings.custom_charm_price ?? null,
        keychain_price: settings.keychain_price ?? null,
        keychain_double_price: settings.keychain_double_price ?? null,
        pickup_options: settings.pickup_options?.filter(Boolean) ?? null,
        qris_image_url: settings.qris_image_url || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1)

    if (!error) alert('Pengaturan disimpan')
    else alert('Gagal menyimpan')
  }

  async function savePackage() {
    if (!editingPkg || !editingPkg.name || editingPkg.price === undefined) return

    const data = {
      name: editingPkg.name,
      price: editingPkg.price,
      description: editingPkg.description || null,
      items: editingPkg.items?.filter(Boolean) ?? [],
      included_charms: editingPkg.included_charms ?? 0,
      is_active: editingPkg.is_active ?? true,
    }

    const { error } = editingPkg.id
      ? await supabaseAdmin.from('packages').update(data).eq('id', editingPkg.id)
      : await supabaseAdmin.from('packages').insert([data])

    if (!error) {
      setEditingPkg(null)
      loadData()
    } else {
      alert('Gagal menyimpan')
    }
  }

  async function deletePackage(id: string) {
    if (!confirm('Hapus paket ini?')) return
    const { error } = await supabaseAdmin.from('packages').delete().eq('id', id)
    if (!error) loadData()
  }

  async function saveCharm() {
    if (!editingCharm || !(editingCharm.emoji || editingCharm.image_url || editingCharm.catalog_index)) return

    const data = {
      emoji: editingCharm.emoji || '',
      name: editingCharm.name || null,
      image_url: editingCharm.image_url || null,
      catalog_index: editingCharm.catalog_index || null,
      price: editingCharm.price || null,
      is_active: editingCharm.is_active ?? true,
      sort_order: editingCharm.sort_order || 0,
    }

    const { error } = editingCharm.id
      ? await supabaseAdmin.from('charms').update(data).eq('id', editingCharm.id)
      : await supabaseAdmin.from('charms').insert([data])

    if (!error) {
      setEditingCharm(null)
      loadData()
    } else {
      alert('Gagal menyimpan')
    }
  }

  async function deleteCharm(id: string) {
    if (!confirm('Hapus charm ini?')) return
    const { error } = await supabaseAdmin.from('charms').delete().eq('id', id)
    if (!error) loadData()
  }

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
        <div className="bg-card rounded-2xl p-8 border border-line shadow-lg w-full max-w-sm">
          <h1 className="font-display text-2xl font-semibold text-center mb-6">Admin Login</h1>
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            className="w-full px-4 py-3 rounded-xl border border-line bg-cream focus:border-cherry focus:outline-none mb-4"
          />
          <button
            onClick={handleLogin}
            className="w-full py-3 bg-cherry text-cream font-bold rounded-full hover:bg-cherry/90 transition-all"
          >
            Masuk
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-cream">
      <header className="bg-char text-cream py-6 px-6">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <h1 className="font-display text-2xl font-semibold">Chamera Admin</h1>
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
          {(['orders', 'packages', 'charms', 'settings'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-full font-semibold whitespace-nowrap transition-all ${
                tab === t ? 'bg-cherry text-cream' : 'hover:bg-rose/30'
              }`}
            >
              {t === 'orders' ? 'Pesanan' : t === 'packages' ? 'Paket' : t === 'charms' ? 'Charm' : 'Pengaturan'}
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
                    </tr>
                  </thead>
                  <tbody>
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
                            onChange={e => updateOrderStatus(order.id, e.target.value)}
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
                      </tr>
                      {openOrder === order.id && (
                        <tr className="bg-cream/60">
                          <td colSpan={8} className="p-4">
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
          </div>
        )}

        {tab === 'packages' && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <button
                onClick={() => setEditingPkg({ name: '', price: 0, is_active: true })}
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
                      {pkg.description && <p className="text-sm text-char/70 mt-1">{pkg.description}</p>}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setEditingPkg(pkg)}
                        className="px-3 py-1 text-sm bg-sky/30 rounded-full hover:bg-sky/50"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deletePackage(pkg.id)}
                        className="px-3 py-1 text-sm bg-rose/50 rounded-full hover:bg-rose"
                      >
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
                <div className="bg-card rounded-2xl p-6 w-full max-w-md border border-line">
                  <h3 className="font-display text-xl font-semibold mb-4">
                    {editingPkg.id ? 'Edit Paket' : 'Tambah Paket'}
                  </h3>
                  <div className="space-y-4">
                    <input
                      type="text"
                      placeholder="Nama paket"
                      value={editingPkg.name || ''}
                      onChange={e => setEditingPkg(prev => prev ? { ...prev, name: e.target.value } : null)}
                      className="w-full px-4 py-3 rounded-xl border border-line bg-cream focus:border-cherry focus:outline-none"
                    />
                    <input
                      type="number"
                      placeholder="Harga"
                      value={editingPkg.price || 0}
                      onChange={e => setEditingPkg(prev => prev ? { ...prev, price: parseInt(e.target.value) || 0 } : null)}
                      className="w-full px-4 py-3 rounded-xl border border-line bg-cream focus:border-cherry focus:outline-none"
                    />
                    <textarea
                      placeholder="Deskripsi (opsional)"
                      value={editingPkg.description || ''}
                      onChange={e => setEditingPkg(prev => prev ? { ...prev, description: e.target.value } : null)}
                      className="w-full px-4 py-3 rounded-xl border border-line bg-cream focus:border-cherry focus:outline-none resize-none"
                      rows={2}
                    />
                    <label className="block text-sm">
                      Isi set (satu baris satu item, contoh: 1x Plain Bracelet)
                      <textarea
                        value={(editingPkg.items ?? []).join('\n')}
                        onChange={e => setEditingPkg(prev => prev ? { ...prev, items: e.target.value.split('\n') } : null)}
                        className="mt-1 w-full px-4 py-3 rounded-xl border border-line bg-cream focus:border-cherry focus:outline-none resize-none"
                        rows={3}
                      />
                    </label>
                    <label className="block text-sm">
                      Jumlah charm biasa yang sudah termasuk harga set
                      <input
                        type="number"
                        min={0}
                        value={editingPkg.included_charms ?? 0}
                        onChange={e => setEditingPkg(prev => prev ? { ...prev, included_charms: parseInt(e.target.value) || 0 } : null)}
                        className="mt-1 w-full px-4 py-3 rounded-xl border border-line bg-cream focus:border-cherry focus:outline-none"
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
                      onClick={savePackage}
                      className="flex-1 py-3 bg-cherry text-cream font-semibold rounded-full hover:bg-cherry/90 transition-all"
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
            <div className="flex justify-end">
              <button
                onClick={() => setEditingCharm({ emoji: '', sort_order: 0, is_active: true })}
                className="px-4 py-2 bg-cherry text-cream font-semibold rounded-full hover:bg-cherry/90 transition-all"
              >
                + Tambah Charm
              </button>
            </div>

            <div className="bg-card rounded-2xl border border-line p-4">
              <div className="flex flex-wrap gap-3">
                {charms.map(charm => (
                  <div key={charm.id} className="relative group">
                    <div
                      className={`w-16 h-16 rounded-xl text-3xl flex items-center justify-center ${
                        charm.is_active ? 'bg-rose' : 'bg-char/10 opacity-50'
                      }`}
                    >
                      {charm.image_url || charm.catalog_index ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={charm.image_url || `/charms/catalog-${String(charm.catalog_index).padStart(2, '0')}.webp`}
                          alt={charm.name || 'Charm'}
                          className="w-full h-full object-contain"
                        />
                      ) : charm.emoji}
                    </div>
                    <div className="absolute -top-1 -right-1 hidden group-hover:flex gap-1">
                      <button
                        onClick={() => setEditingCharm(charm)}
                        className="w-6 h-6 bg-sky rounded-full text-xs flex items-center justify-center"
                      >
                        ✎
                      </button>
                      <button
                        onClick={() => deleteCharm(charm.id)}
                        className="w-6 h-6 bg-rose rounded-full text-xs flex items-center justify-center"
                      >
                        ×
                      </button>
                    </div>
                    {charm.name && (
                      <p className="text-xs text-center mt-1 text-char/70">{charm.name}</p>
                    )}
                  </div>
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
                    <input
                      type="text"
                      placeholder="Emoji (contoh: 🌸)"
                      value={editingCharm.emoji || ''}
                      onChange={e => setEditingCharm(prev => prev ? { ...prev, emoji: e.target.value } : null)}
                      className="w-full px-4 py-3 rounded-xl border border-line bg-cream focus:border-cherry focus:outline-none text-2xl text-center"
                    />
                    <input
                      type="text"
                      placeholder="Nama (opsional)"
                      value={editingCharm.name || ''}
                      onChange={e => setEditingCharm(prev => prev ? { ...prev, name: e.target.value } : null)}
                      className="w-full px-4 py-3 rounded-xl border border-line bg-cream focus:border-cherry focus:outline-none"
                    />
                    <input
                      type="url"
                      placeholder="URL gambar charm (opsional)"
                      value={editingCharm.image_url || ''}
                      onChange={e => setEditingCharm(prev => prev ? { ...prev, image_url: e.target.value } : null)}
                      className="w-full px-4 py-3 rounded-xl border border-line bg-cream focus:border-cherry focus:outline-none"
                    />
                    <input
                      type="number"
                      min={1}
                      placeholder="Nomor di katalog bawaan (1-64, opsional)"
                      value={editingCharm.catalog_index || ''}
                      onChange={e => setEditingCharm(prev => prev ? { ...prev, catalog_index: parseInt(e.target.value) || null } : null)}
                      className="w-full px-4 py-3 rounded-xl border border-line bg-cream focus:border-cherry focus:outline-none"
                    />
                    <input
                      type="number"
                      placeholder="Harga khusus (kosongkan untuk harga default)"
                      value={editingCharm.price || ''}
                      onChange={e => setEditingCharm(prev => prev ? { ...prev, price: parseInt(e.target.value) || null } : null)}
                      className="w-full px-4 py-3 rounded-xl border border-line bg-cream focus:border-cherry focus:outline-none"
                    />
                    <input
                      type="number"
                      placeholder="Urutan"
                      value={editingCharm.sort_order || 0}
                      onChange={e => setEditingCharm(prev => prev ? { ...prev, sort_order: parseInt(e.target.value) || 0 } : null)}
                      className="w-full px-4 py-3 rounded-xl border border-line bg-cream focus:border-cherry focus:outline-none"
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
                      onClick={() => setEditingCharm(null)}
                      className="flex-1 py-3 bg-char/10 rounded-full font-semibold hover:bg-char/20 transition-all"
                    >
                      Batal
                    </button>
                    <button
                      onClick={saveCharm}
                      className="flex-1 py-3 bg-cherry text-cream font-semibold rounded-full hover:bg-cherry/90 transition-all"
                    >
                      Simpan
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'settings' && settings && (
          <div className="max-w-lg mx-auto">
            <div className="bg-card rounded-2xl p-6 border border-line space-y-6">
              <div>
                <label className="block font-medium mb-2">Jumlah slot bracelet</label>
                <input
                  type="number"
                  value={settings.slot_count}
                  onChange={e => setSettings(prev => prev ? { ...prev, slot_count: parseInt(e.target.value) || 9 } : null)}
                  className="w-full px-4 py-3 rounded-xl border border-line bg-cream focus:border-cherry focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-medium mb-2">Password admin</label>
                <input
                  type="text"
                  value={settings.admin_password}
                  onChange={e => setSettings(prev => prev ? { ...prev, admin_password: e.target.value } : null)}
                  className="w-full px-4 py-3 rounded-xl border border-line bg-cream focus:border-cherry focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-medium mb-2">Nomor WhatsApp (untuk notifikasi)</label>
                <input
                  type="text"
                  placeholder="628123456789"
                  value={settings.whatsapp_number || ''}
                  onChange={e => setSettings(prev => prev ? { ...prev, whatsapp_number: e.target.value } : null)}
                  className="w-full px-4 py-3 rounded-xl border border-line bg-cream focus:border-cherry focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-medium mb-2">Judul batch (contoh: Open PO Batch 2)</label>
                <input
                  type="text"
                  value={settings.batch_label || ''}
                  onChange={e => setSettings(prev => prev ? { ...prev, batch_label: e.target.value } : null)}
                  className="w-full px-4 py-3 rounded-xl border border-line bg-cream focus:border-cherry focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                {([
                  ['charm_price', 'Harga charm'],
                  ['custom_charm_price', 'Harga charm custom'],
                  ['keychain_price', 'Keychain satu sisi'],
                  ['keychain_double_price', 'Keychain bolak balik'],
                ] as const).map(([key, label]) => (
                  <div key={key}>
                    <label className="block font-medium mb-2">{label}</label>
                    <input
                      type="number"
                      value={settings[key] ?? ''}
                      onChange={e => setSettings(prev => prev ? { ...prev, [key]: parseInt(e.target.value) || null } : null)}
                      className="w-full px-4 py-3 rounded-xl border border-line bg-cream focus:border-cherry focus:outline-none"
                    />
                  </div>
                ))}
              </div>
              <div>
                <label className="block font-medium mb-2">Pilihan pengambilan (satu baris satu pilihan)</label>
                <textarea
                  rows={3}
                  value={(settings.pickup_options ?? []).join('\n')}
                  onChange={e => setSettings(prev => prev ? { ...prev, pickup_options: e.target.value.split('\n') } : null)}
                  className="w-full px-4 py-3 rounded-xl border border-line bg-cream focus:border-cherry focus:outline-none resize-none"
                />
              </div>
              <div>
                <label className="block font-medium mb-2">URL gambar QRIS (kosongkan untuk /assets/qris.png)</label>
                <input
                  type="url"
                  value={settings.qris_image_url || ''}
                  onChange={e => setSettings(prev => prev ? { ...prev, qris_image_url: e.target.value } : null)}
                  className="w-full px-4 py-3 rounded-xl border border-line bg-cream focus:border-cherry focus:outline-none"
                />
              </div>
              <button
                onClick={updateSettings}
                className="w-full py-3 bg-cherry text-cream font-semibold rounded-full hover:bg-cherry/90 transition-all"
              >
                Simpan Pengaturan
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
