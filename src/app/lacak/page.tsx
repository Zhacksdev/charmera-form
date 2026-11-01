import type { Metadata } from 'next'
import { TrackOrder } from '@/components/order/TrackOrder'

export const metadata: Metadata = {
  title: 'Lacak Pesanan – Charmera',
  description: 'Cek status pesanan Charmera kamu dengan kode pesanan dan nomor WhatsApp.',
}

// Static page; the ?kode= from the thank-you link is read in the browser.
export default function Page() {
  return <TrackOrder />
}
