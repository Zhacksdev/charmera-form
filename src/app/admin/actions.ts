'use server'

// Every admin read/write runs here on the server, so the service role key never reaches the browser.
import { cookies } from 'next/headers'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { UPLOAD_BUCKET } from '@/lib/supabase'
import { supabaseAdmin } from '@/lib/supabase-admin'
import type { Charm, Order, Package, Settings } from '@/lib/supabase'

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
}

const COOKIE = 'charmera_admin'
const SESSION_DAYS = 7
const ORDER_STATUSES = ['Menunggu verifikasi', 'Menunggu bayar', 'Terbayar', 'Diproses', 'Selesai']

function fail(error: string): Result<never> {
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
    const { error } = await supabaseAdmin.from('settings').update({
      batch_label: settings.batch_label?.trim() || null,
      slot_count: Math.min(30, Math.max(1, Math.round(Number(settings.slot_count)) || 9)),
      whatsapp_number: settings.whatsapp_number?.replace(/\D/g, '') || null,
      pickup_options: settings.pickup_options.map(o => o.trim()).filter(Boolean),
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
      items: pkg.items?.map(i => i.trim()).filter(Boolean) ?? [],
      included_charms: price(pkg.included_charms) ?? 0,
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
