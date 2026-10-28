import Image from 'next/image'
import { formatRupiah, whatsappLink } from '@/lib/order'
import type { ShopConfig } from '@/lib/order'

export interface CompletedOrder {
  code: string
  name: string
  total: number
}

export const WARRANTY_DAYS = 7

function Handle({ name, base, label }: { name: string; base: string; label: string }) {
  if (!name) return <>{label} kami</>
  return (
    <>
      {label}{' '}
      <a href={`${base}${name}`} target="_blank" rel="noreferrer">@{name}</a>
    </>
  )
}

export function SuccessPanel({ order, config, onStartOver }: {
  order: CompletedOrder
  config: Pick<ShopConfig, 'whatsappNumber' | 'instagram' | 'tiktok'>
  onStartOver: () => void
}) {
  const confirmUrl = whatsappLink(
    config.whatsappNumber,
    `Halo Admin Charmera, aku ${order.name} sudah submit pembayaran untuk pesanan ${order.code} sebesar ${formatRupiah(order.total)}. Mohon dicek, ya. Terima kasih!`,
  )

  return (
    <section className="success" aria-live="polite">
      <Image src="/assets/maskot-thx.webp" alt="" width={431} height={482} />
      <h2 className="bubble-title is-section">Makasih, {order.name}!</h2>
      <p>Pesananmu sudah masuk. Simpan kode pesanan ini, ya.</p>
      <p className="order-code">{order.code}</p>

      <div className="success-box is-announce" role="note">
        <h3 className="bubble-title is-small">Satu langkah lagi!</h3>
        <p>
          Konfirmasi pembayaranmu ke WhatsApp admin dengan menyertakan kode pesanan di atas,
          supaya pesananmu bisa segera kami proses.
        </p>
        {confirmUrl ? (
          <a className="btn-primary success-wa" href={confirmUrl} target="_blank" rel="noreferrer">
            Konfirmasi ke WhatsApp Admin
          </a>
        ) : (
          <p className="muted">Admin akan menghubungimu lewat WhatsApp untuk konfirmasi.</p>
        )}
      </div>

      <div className="success-box">
        <h3 className="bubble-title is-small">Garansi {WARRANTY_DAYS} Hari</h3>
        <p>
          Garansi berlaku paling lama <strong>{WARRANTY_DAYS} hari setelah pesanan diterima</strong>, dengan syarat:
        </p>
        <ol>
          <li>
            Sudah follow <Handle name={config.instagram} base="https://instagram.com/" label="Instagram" /> dan{' '}
            <Handle name={config.tiktok} base="https://www.tiktok.com/@" label="TikTok" />.
          </li>
          <li>
            Sudah upload review di Instagram dengan tag{' '}
            {config.instagram ? <strong>@{config.instagram}</strong> : 'akun Instagram kami'}.
          </li>
        </ol>
        <p className="success-warning">Jika syarat di atas tidak dipenuhi, garansi tidak berlaku.</p>
      </div>

      <button type="button" className="btn-primary" onClick={onStartOver}>Buat pesanan baru</button>
    </section>
  )
}
