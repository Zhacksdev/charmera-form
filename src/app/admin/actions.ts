'use server'

// Every admin read/write runs here on the server, so the service role key never reaches the browser.
import { cookies } from 'next/headers'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { UPLOAD_BUCKET } from '@/lib/supabase'
import { supabaseAdmin } from '@/lib/supabase-admin'
import type { Charm, Order, OrderInsert, Package, Settings } from '@/lib/supabase'
import { FALLBACK_PACKAGES, KEYCHAIN_SHAPE_IDS, ORDER_STATUSES, newOrderCode } from '@/lib/order'
import { CHARM_CATALOG_COUNT } from '@/lib/charm-catalog.generated'
import type { KeychainShape } from '@/lib/order'

export type Result<T = null> = { ok: true; data: T } | { ok: false; error: string }

export interface AdminData {
  settings: Settings | null
  orders: Order[]
  packages: Package[]
  charms: Charm[]
}

export interface UnitPrices {
  charm_price: number | null
  custom_charm_price: number | null
  keychain_price: number | null
  keychain_double_price: number | null
}

export interface PriceUpdate {
  unit: UnitPrices
  packages: { id: string; price: number; included_charms: number }[]
  charms: { id: string; price: number | null }[]
}

export interface GeneralSettings {
  batch_label: string | null
  slot_count: number
  whatsapp_number: string | null
  pickup_options: string[]
  keychain_shapes: KeychainShape[]
  instagram_username: string | null
  tiktok_username: string | null
}

const COOKIE = 'charmera_admin'
const SESSION_DAYS = 7

function fail(error: string): Result<never> {
  // A column added in a newer schema.sql that hasn't been run on this database yet.
  const missing = error.match(/'(\w+)' column of '(\w+)'|column (?:\w+\.)?"?(\w+)"? does not exist/)
  if (missing) {
    const column = missing[1] ?? missing[3]
    return { ok: false, error: `Kolom "${column}" belum ada di database. Jalankan ulang supabase/schema.sql di SQL Editor Supabase, lalu coba lagi.` }
  }
  return { ok: false, error }
}

function sessionToken(password: string) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) throw new Error('SUPABASE_SERVICE_ROLE_KEY belum diisi di environment.')
  // Changing ADMIN_PASSWORD invalidates every existing session.
  return createHmac('sha256', secret).update(`charmera-admin:${password}`).digest('hex')
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

async function isAdmin() {
  const password = process.env.ADMIN_PASSWORD
  const token = (await cookies()).get(COOKIE)?.value
  return Boolean(password && token && safeEqual(token, sessionToken(password)))
}

async function guarded<T>(run: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    if (!(await isAdmin())) return fail('Sesi admin berakhir. Login lagi, ya.')
    return await run()
  } catch (error) {
    console.error(error)
    return fail(error instanceof Error ? error.message : 'Terjadi kesalahan di server.')
  }
}

function price(value: unknown): number | null {
  const n = Math.round(Number(value))
  return Number.isFinite(n) && n >= 0 && value !== '' && value !== null ? n : null
}

// Accept "@name" or a pasted profile URL and keep just the name.
function username(value: string | null) {
  const name = value?.trim().split('?')[0].replace(/\/+$/, '').split('/').pop()?.replace(/^@/, '')
  return name || null
}

export async function login(password: string): Promise<Result> {
  const expected = process.env.ADMIN_PASSWORD
  if (!expected) return fail('ADMIN_PASSWORD belum diisi di environment.')
  if (!safeEqual(password, expected)) return fail('Password salah.')
  ;(await cookies()).set(COOKIE, sessionToken(expected), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  })
  return { ok: true, data: null }
}

export async function logout(): Promise<Result> {
  ;(await cookies()).delete(COOKIE)
  return { ok: true, data: null }
}

export async function hasSession(): Promise<boolean> {
  try {
    return await isAdmin()
  } catch {
    return false
  }
}

export async function loadAdminData(): Promise<Result<AdminData>> {
  return guarded(async () => {
    const [settingsRes, ordersRes, packagesRes, charmsRes] = await Promise.all([
      supabaseAdmin.from('settings').select('*').eq('id', 1).maybeSingle(),
      supabaseAdmin.from('orders').select('*').order('created_at', { ascending: false }),
      supabaseAdmin.from('packages').select('*').order('price'),
      supabaseAdmin.from('charms').select('*').order('sort_order'),
    ])
    const error = settingsRes.error ?? ordersRes.error ?? packagesRes.error ?? charmsRes.error
    if (error) return fail(`Gagal memuat data: ${error.message}`)
    return {
      ok: true,
      data: {
        settings: settingsRes.data,
        orders: ordersRes.data ?? [],
        packages: packagesRes.data ?? [],
        charms: charmsRes.data ?? [],
      },
    }
  })
}

export async function updateOrderStatus(id: string, status: string): Promise<Result> {
  return guarded(async () => {
    if (!ORDER_STATUSES.includes(status)) return fail('Status tidak dikenal.')
    const { error } = await supabaseAdmin.from('orders').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
    return error ? fail(error.message) : { ok: true, data: null }
  })
}

export async function savePrices(update: PriceUpdate): Promise<Result> {
  return guarded(async () => {
    const now = new Date().toISOString()
    const { error: unitError } = await supabaseAdmin.from('settings').update({
      charm_price: price(update.unit.charm_price),
      custom_charm_price: price(update.unit.custom_charm_price),
      keychain_price: price(update.unit.keychain_price),
      keychain_double_price: price(update.unit.keychain_double_price),
      updated_at: now,
    }).eq('id', 1)
    if (unitError) return fail(`Gagal menyimpan harga satuan: ${unitError.message}`)

    const results = await Promise.all([
      ...update.packages.map(p => supabaseAdmin.from('packages').update({
        price: price(p.price) ?? 0,
        included_charms: price(p.included_charms) ?? 0,
        updated_at: now,
      }).eq('id', p.id)),
      ...update.charms.map(c => supabaseAdmin.from('charms').update({ price: price(c.price) }).eq('id', c.id)),
    ])
    const failed = results.find(r => r.error)
    return failed?.error ? fail(`Sebagian harga gagal disimpan: ${failed.error.message}`) : { ok: true, data: null }
  })
}

export async function saveGeneralSettings(settings: GeneralSettings): Promise<Result> {
  return guarded(async () => {
    const shapes = KEYCHAIN_SHAPE_IDS.filter(s => settings.keychain_shapes.includes(s))
    if (shapes.length === 0) return fail('Aktifkan minimal satu bentuk keychain.')
    const { error } = await supabaseAdmin.from('settings').update({
      batch_label: settings.batch_label?.trim() || null,
      slot_count: Math.min(30, Math.max(1, Math.round(Number(settings.slot_count)) || 9)),
      whatsapp_number: settings.whatsapp_number?.replace(/\D/g, '') || null,
      pickup_options: settings.pickup_options.map(o => o.trim()).filter(Boolean),
      keychain_shapes: shapes,
      instagram_username: username(settings.instagram_username),
      tiktok_username: username(settings.tiktok_username),
      updated_at: new Date().toISOString(),
    }).eq('id', 1)
    return error ? fail(error.message) : { ok: true, data: null }
  })
}

// The QR image goes straight from the browser to Storage through a one-time signed URL,
// which avoids the server action body size limit.
export async function createQrisUpload(extension: string): Promise<Result<{ path: string; token: string }>> {
  return guarded(async () => {
    const ext = extension.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'png'
    const path = `settings/qris-${Date.now()}.${ext}`
    const { data, error } = await supabaseAdmin.storage.from(UPLOAD_BUCKET).createSignedUploadUrl(path)
    return error ? fail(error.message) : { ok: true, data: { path, token: data.token } }
  })
}

// Same signed-URL route for a charm picture; the public URL is stored as the charm's image_url on save.
export async function createCharmUpload(extension: string): Promise<Result<{ path: string; token: string; url: string }>> {
  return guarded(async () => {
    const ext = extension.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'png'
    const path = `charms/charm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
    const { data, error } = await supabaseAdmin.storage.from(UPLOAD_BUCKET).createSignedUploadUrl(path)
    if (error) return fail(error.message)
    const url = supabaseAdmin.storage.from(UPLOAD_BUCKET).getPublicUrl(path).data.publicUrl
    return { ok: true, data: { path, token: data.token, url } }
  })
}

export async function setQrisImage(path: string | null): Promise<Result<string | null>> {
  return guarded(async () => {
    if (path !== null && !/^settings\/qris-\d+\.[a-z0-9]+$/.test(path)) return fail('Lokasi file QR tidak valid.')
    const url = path ? supabaseAdmin.storage.from(UPLOAD_BUCKET).getPublicUrl(path).data.publicUrl : null
    const { error } = await supabaseAdmin.from('settings').update({ qris_image_url: url, updated_at: new Date().toISOString() }).eq('id', 1)
    return error ? fail(error.message) : { ok: true, data: url }
  })
}

export async function savePackage(pkg: Partial<Package>): Promise<Result> {
  return guarded(async () => {
    if (!pkg.name?.trim()) return fail('Nama paket wajib diisi.')
    const data = {
      name: pkg.name.trim(),
      price: price(pkg.price) ?? 0,
      description: pkg.description || null,
      // Card lines are generated from the contents checklist, so old free-text items are cleared.
      items: [],
      included_charms: price(pkg.included_charms) ?? 0,
      bracelet_count: price(pkg.bracelet_count) ?? 1,
      included_custom_charms: price(pkg.included_custom_charms) ?? 0,
      included_keychains: price(pkg.included_keychains) ?? 0,
      is_active: pkg.is_active ?? true,
    }
    const { error } = pkg.id
      ? await supabaseAdmin.from('packages').update(data).eq('id', pkg.id)
      : await supabaseAdmin.from('packages').insert([data])
    return error ? fail(error.message) : { ok: true, data: null }
  })
}

export async function deletePackage(id: string): Promise<Result> {
  return guarded(async () => {
    const { error } = await supabaseAdmin.from('packages').delete().eq('id', id)
    return error ? fail(error.message) : { ok: true, data: null }
  })
}

export async function saveCharm(charm: Partial<Charm>): Promise<Result> {
  return guarded(async () => {
    if (!(charm.emoji || charm.image_url || charm.catalog_index)) return fail('Isi gambar, nomor katalog, atau emoji.')
    const data = {
      emoji: charm.emoji || '',
      name: charm.name || null,
      image_url: charm.image_url || null,
      catalog_index: charm.catalog_index || null,
      price: price(charm.price),
      is_active: charm.is_active ?? true,
      sort_order: charm.sort_order || 0,
    }
    const { error } = charm.id
      ? await supabaseAdmin.from('charms').update(data).eq('id', charm.id)
      : await supabaseAdmin.from('charms').insert([data])
    return error ? fail(error.message) : { ok: true, data: null }
  })
}

export async function deleteCharm(id: string): Promise<Result> {
  return guarded(async () => {
    const { error } = await supabaseAdmin.from('charms').delete().eq('id', id)
    return error ? fail(error.message) : { ok: true, data: null }
  })
}

// Copy the built-in packages and the 64-charm photo catalog into the database so they can be edited here.
// Only fills a table that has nothing the form would show yet, so it never duplicates admin data.
export async function importDefaultCatalog(): Promise<Result<{ packages: number; charms: number }>> {
  return guarded(async () => {
    const [pkgRes, charmRes] = await Promise.all([
      supabaseAdmin.from('packages').select('id', { count: 'exact', head: true }),
      supabaseAdmin.from('charms').select('id, image_url, catalog_index'),
    ])
    const error = pkgRes.error ?? charmRes.error
    if (error) return fail(`Gagal memeriksa data: ${error.message}`)

    let packages = 0
    if (!pkgRes.count) {
      const rows = FALLBACK_PACKAGES.map((p, i) => ({
        name: p.name,
        price: p.price,
        items: p.items ?? [],
        included_charms: p.included_charms ?? 0,
        sort_order: i,
        is_active: true,
      }))
      const { error: insertError } = await supabaseAdmin.from('packages').insert(rows)
      if (insertError) return fail(`Gagal memasukkan paket: ${insertError.message}`)
      packages = rows.length
    }

    let charms = 0
    if (!(charmRes.data ?? []).some(c => c.image_url || c.catalog_index)) {
      const rows = Array.from({ length: CHARM_CATALOG_COUNT }, (_, i) => ({
        name: `Charm ${i + 1}`,
        emoji: '',
        catalog_index: i + 1,
        sort_order: i + 1,
        is_active: true,
      }))
      const { error: insertError } = await supabaseAdmin.from('charms').insert(rows)
      if (insertError) return fail(`Gagal memasukkan charm: ${insertError.message}`)
      charms = rows.length
    }

    return { ok: true, data: { packages, charms } }
  })
}

const ORDER_TEXT_FIELDS = [
  'customer_name', 'customer_whatsapp', 'customer_email', 'customer_instagram', 'pickup_method', 'package_name', 'notes', 'payment_proof_url',
] as const

// Keep only the order columns the admin may set, trimmed and typed.
function orderFields(input: Partial<Order>): Partial<OrderInsert> {
  const out: Partial<OrderInsert> = {}
  const text = (key: (typeof ORDER_TEXT_FIELDS)[number]) => String(input[key] ?? '').trim()
  for (const key of ORDER_TEXT_FIELDS) {
    if (!(key in input)) continue
    if (key === 'customer_name' || key === 'package_name' || key === 'customer_whatsapp') out[key] = text(key)
    else out[key] = text(key) || null
  }
  if ('customer_whatsapp' in input) out.customer_whatsapp = String(input.customer_whatsapp ?? '').replace(/\D/g, '')
  if ('customer_instagram' in input && out.customer_instagram) out.customer_instagram = out.customer_instagram.replace(/^@/, '')
  if ('pickup_method' in input) out.customer_address = out.pickup_method ?? ''
  if ('total_price' in input) out.total_price = price(input.total_price) ?? 0
  if ('quantity' in input) out.quantity = Math.max(1, Math.round(Number(input.quantity)) || 1)
  if ('status' in input) out.status = ORDER_STATUSES.includes(String(input.status)) ? String(input.status) : ORDER_STATUSES[0]
  if ('charms' in input) out.charms = Array.isArray(input.charms) ? input.charms.map(String).filter(Boolean) : []
  if ('items' in input) out.items = input.items ?? null
  if ('created_at' in input && input.created_at && !Number.isNaN(Date.parse(input.created_at))) {
    out.created_at = new Date(input.created_at).toISOString()
  }
  return out
}

// Columns that are NOT NULL without a default must be present on new rows.
function newOrder(fields: Partial<OrderInsert>, code: string): OrderInsert {
  return {
    status: ORDER_STATUSES[0],
    total_price: 0,
    ...fields,
    order_code: code,
    customer_name: fields.customer_name || 'Tanpa nama',
    customer_whatsapp: fields.customer_whatsapp ?? '',
    customer_address: fields.customer_address ?? '',
    package_name: fields.package_name ?? '',
    package_price: fields.package_price ?? 0,
  }
}

export async function saveOrder(order: Partial<Order>): Promise<Result> {
  return guarded(async () => {
    if (!order.customer_name?.trim()) return fail('Nama pelanggan wajib diisi.')
    const fields = orderFields(order)
    const now = new Date().toISOString()
    const { error } = order.id
      ? await supabaseAdmin.from('orders').update({ ...fields, updated_at: now }).eq('id', order.id)
      : await supabaseAdmin.from('orders').insert(newOrder(fields, order.order_code?.trim() || newOrderCode()))
    if (error?.code === '23505') return fail('Kode pesanan itu sudah dipakai.')
    return error ? fail(error.message) : { ok: true, data: null }
  })
}

export async function deleteOrder(id: string): Promise<Result> {
  return guarded(async () => {
    const { error } = await supabaseAdmin.from('orders').delete().eq('id', id)
    return error ? fail(error.message) : { ok: true, data: null }
  })
}

// Rows from an imported CSV. A row whose order code already exists updates that order
// (only the columns present in the file); every other row is added as a new order.
export async function importOrders(rows: Partial<Order>[]): Promise<Result<{ added: number; updated: number }>> {
  return guarded(async () => {
    if (rows.length > 500) return fail('Maksimal 500 baris per kiriman.')
    const byCode = new Map<string, Partial<Order>>()
    for (const row of rows) {
      const code = row.order_code?.trim() || newOrderCode()
      byCode.set(code, { ...byCode.get(code), ...row })
    }
    const codes = [...byCode.keys()]
    const { data: existing, error } = await supabaseAdmin.from('orders').select('id, order_code').in('order_code', codes)
    if (error) return fail(`Gagal memeriksa pesanan: ${error.message}`)
    const idByCode = new Map((existing ?? []).map(o => [o.order_code, o.id]))

    const now = new Date().toISOString()
    const inserts: OrderInsert[] = []
    const updates: { id: string; fields: Partial<OrderInsert> }[] = []
    for (const [code, row] of byCode) {
      const fields = orderFields(row)
      const id = idByCode.get(code)
      if (id) updates.push({ id, fields: { ...fields, updated_at: now } })
      else inserts.push(newOrder(fields, code))
    }

    if (inserts.length) {
      // Rows may have different columns (empty cells are left out). Without defaultToNull: false,
      // a column missing from one row is sent as NULL instead of the column default (created_at, quantity, charms…).
      const { error: insertError } = await supabaseAdmin.from('orders').insert(inserts, { defaultToNull: false })
      if (insertError) return fail(`Gagal menambah pesanan: ${insertError.message}`)
    }
    const results = await Promise.all(updates.map(u => supabaseAdmin.from('orders').update(u.fields).eq('id', u.id)))
    const failed = results.find(r => r.error)
    if (failed?.error) return fail(`Sebagian pesanan gagal diperbarui: ${failed.error.message}`)
    return { ok: true, data: { added: inserts.length, updated: updates.length } }
  })
}
