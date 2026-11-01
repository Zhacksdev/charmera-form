'use server'

import { supabaseAdmin } from '@/lib/supabase-admin'

export interface TrackedOrder {
  code: string
  name: string
  status: string
  createdAt: string
  updatedAt: string
  total: number
  items: string[]
  pickup: string | null
}

export type TrackResult =
  | { ok: true; order: TrackedOrder; whatsappNumber: string }
  | { ok: false; error: string }

// 08xx, 628xx and +62 8xx are the same number.
function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, '')
  return digits.startsWith('62') ? `0${digits.slice(2)}` : digits
}

// Public lookup: the order code alone is not enough, the WhatsApp number used at checkout must match too,
// and only what the customer needs to follow their order is returned.
export async function trackOrder(code: string, phone: string): Promise<TrackResult> {
  const orderCode = code.trim().toUpperCase()
  const customerPhone = normalizePhone(phone)
  if (!orderCode) return { ok: false, error: 'Isi kode pesananmu.' }
  if (customerPhone.length < 9) return { ok: false, error: 'Isi nomor WhatsApp yang dipakai saat memesan.' }

  try {
    const [orderRes, settingsRes] = await Promise.all([
      supabaseAdmin
        .from('orders')
        .select('order_code, customer_name, customer_whatsapp, status, created_at, updated_at, total_price, package_name, pickup_method')
        .eq('order_code', orderCode)
        .maybeSingle(),
      supabaseAdmin.from('settings').select('whatsapp_number').eq('id', 1).maybeSingle(),
    ])
    if (orderRes.error) throw orderRes.error
    const order = orderRes.data
    if (!order || normalizePhone(order.customer_whatsapp) !== customerPhone) {
      return { ok: false, error: 'Pesanan tidak ditemukan. Cek lagi kode pesanan dan nomor WhatsApp-nya, ya.' }
    }
    return {
      ok: true,
      whatsappNumber: settingsRes.data?.whatsapp_number ?? '',
      order: {
        code: order.order_code ?? orderCode,
        name: order.customer_name.trim().split(/\s+/)[0] ?? '',
        status: order.status,
        createdAt: order.created_at,
        updatedAt: order.updated_at,
        total: order.total_price,
        items: order.package_name.split(' + ').map((s: string) => s.trim()).filter(Boolean),
        pickup: order.pickup_method,
      },
    }
  } catch (error) {
    console.error(error)
    return { ok: false, error: 'Lagi ada gangguan. Coba beberapa saat lagi, ya.' }
  }
}
