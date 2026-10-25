import Image from 'next/image'
import { formatRupiah } from '@/lib/order'
import type { ReceiptLine } from './CheckoutPanel'

// Desktop-only order summary; on phones the fixed bottom bar does this job.
export function SummaryCard({ lines, total, onCheckout }: {
  lines: ReceiptLine[]
  total: number
  onCheckout: () => void
}) {
  return (
    <aside className="summary-card dashed-box" aria-label="Ringkasan pesanan">
      <Image className="summary-mascot" src="/assets/maskot-thx.webp" alt="" width={431} height={482} />
      <h2 className="bubble-title is-label">Total Pembelian</h2>
      {lines.length === 0 ? (
        <p className="muted">Belum ada pesanan.</p>
      ) : (
        <ul className="summary-lines">
          {lines.map(line => (
            <li key={line.title}>
              <span>{line.title}</span>
              <span>{formatRupiah(line.price)}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="summary-total">
        <strong>{formatRupiah(total)}</strong>
        <button type="button" className="btn-primary" onClick={onCheckout}>Checkout</button>
      </div>
    </aside>
  )
}
