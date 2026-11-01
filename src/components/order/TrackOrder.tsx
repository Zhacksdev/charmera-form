'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { trackOrder } from '@/app/lacak/actions'
import type { TrackedOrder } from '@/app/lacak/actions'
import { ORDER_STATUSES, formatRupiah, whatsappLink } from '@/lib/order'

// What each admin status means for the customer, in the order the admin moves through them.
const STATUS_INFO: Record<string, { title: string; text: string; icon: string }> = {
  'Menunggu verifikasi': { title: 'Pesanan diterima', text: 'Bukti bayarmu sedang dicek admin.', icon: '🧾' },
  'Menunggu bayar': { title: 'Menunggu pembayaran', text: 'Pembayaran belum kami terima. Selesaikan pembayaran atau hubungi admin, ya.', icon: '💳' },
  Terbayar: { title: 'Pembayaran diterima', text: 'Pembayaranmu sudah masuk. Pesananmu masuk antrean produksi.', icon: '✅' },
  Diproses: { title: 'Sedang dibuat', text: 'Charm dan keychain-mu sedang kami rangkai dengan sepenuh hati.', icon: '🛠️' },
  Selesai: { title: 'Selesai', text: 'Pesananmu sudah jadi dan siap diambil atau dikirim. Makasih, ya!', icon: '🎉' },
}

const REFRESH_MS = 60_000
const STORAGE_KEY = 'charmera-track'

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  } catch {
    return value
  }
}

function readSaved(): { code: string; phone: string } | null {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    return saved && typeof saved.code === 'string' && typeof saved.phone === 'string' ? saved : null
  } catch {
    return null
  }
}

export function TrackOrder() {
  const [code, setCode] = useState('')
  const [phone, setPhone] = useState('')
  const [order, setOrder] = useState<TrackedOrder | null>(null)
  const [whatsappNumber, setWhatsappNumber] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [checkedAt, setCheckedAt] = useState<Date | null>(null)
  const lookup = useRef<{ code: string; phone: string } | null>(null)

  const load = useCallback(async (nextCode: string, nextPhone: string, quiet = false) => {
    if (!quiet) setLoading(true)
    try {
      const result = await trackOrder(nextCode, nextPhone)
      if (!result.ok) {
        if (!quiet) {
          setError(result.error)
          setOrder(null)
        }
        return
      }
      lookup.current = { code: nextCode, phone: nextPhone }
      setOrder(result.order)
      setWhatsappNumber(result.whatsappNumber)
      setError(null)
      setCheckedAt(new Date())
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ code: result.order.code, phone: nextPhone }))
      } catch {}
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [])

  // ?kode= (from the thank-you page) fills the code; a saved lookup for the same order loads right away.
  // Read after mount (the page is prerendered without them), outside the effect's synchronous body.
  useEffect(() => {
    let alive = true
    Promise.resolve().then(() => {
      if (!alive) return
      const fromLink = new URLSearchParams(window.location.search).get('kode')?.trim().toUpperCase() ?? ''
      const saved = readSaved()
      if (saved && (!fromLink || saved.code === fromLink)) {
        setCode(saved.code)
        setPhone(saved.phone)
        load(saved.code, saved.phone)
      } else if (fromLink) {
        setCode(fromLink)
      }
    })
    return () => { alive = false }
  }, [load])

  // Keep the status fresh while the page is open and visible.
  useEffect(() => {
    if (!order) return
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible' && lookup.current) load(lookup.current.code, lookup.current.phone, true)
    }, REFRESH_MS)
    return () => clearInterval(timer)
  }, [order, load])

  function reset() {
    setOrder(null)
    setError(null)
    setCode('')
    setPhone('')
    lookup.current = null
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {}
  }

  const current = order ? ORDER_STATUSES.indexOf(order.status) : -1
  const info = order ? STATUS_INFO[order.status] ?? { title: order.status, text: '', icon: '📦' } : null
  const askAdmin = order
    ? whatsappLink(whatsappNumber, `Halo Admin Charmera, aku mau tanya status pesanan ${order.code}.`)
    : ''

  return (
    <div className="shop">
      <div className="shop-inner">
        <header className="hero">
          <Link href="/">
            <Image className="hero-logo" src="/assets/logo.webp" alt="Charmera – Wear your memories." width={410} height={312} priority />
          </Link>
          <h1 className="bubble-title is-hero">Lacak Pesanan</h1>
        </header>

        {!order ? (
          <form
            className="dashed-box track-form"
            onSubmit={e => {
              e.preventDefault()
              load(code, phone)
            }}
          >
            <p className="track-lead">Masukkan kode pesanan dan nomor WhatsApp yang kamu pakai saat memesan.</p>
            <label className="field">
              <span className="bubble-title is-label">Kode pesanan</span>
              <input
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                placeholder="CHM-XXXXXXXX"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                required
              />
            </label>
            <label className="field">
              <span className="bubble-title is-label">Nomor WhatsApp</span>
              <input
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="08xxxxxxxxxx"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                required
              />
            </label>
            {error && <p className="form-alert" role="alert">{error}</p>}
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Mencari…' : 'Lacak'}
            </button>
            <p className="muted hint is-center">Kode pesanan ada di halaman terima kasih setelah kamu bayar, contohnya CHM-AB12CDE.</p>
          </form>
        ) : (
          <section className="track" aria-live="polite">
            <div className="track-head">
              <p className="muted">Halo{order.name ? `, ${order.name}` : ''}! Ini status pesananmu</p>
              <p className="order-code">{order.code}</p>
            </div>

            {info && (
              <div className={`track-current ${order.status === 'Menunggu bayar' ? 'is-warning' : ''} ${order.status === 'Selesai' ? 'is-done' : ''}`}>
                <span className="track-current-icon" aria-hidden="true">{info.icon}</span>
                <div>
                  <h2 className="bubble-title is-small">{info.title}</h2>
                  {info.text && <p>{info.text}</p>}
                </div>
              </div>
            )}

            <ol className="track-steps" aria-label="Perjalanan pesanan">
              {ORDER_STATUSES.map((status, i) => {
                const state = current < 0 ? 'is-todo' : i < current ? 'is-done' : i === current ? 'is-current' : 'is-todo'
                return (
                  <li key={status} className={`track-step ${state}`} aria-current={i === current ? 'step' : undefined}>
                    <span className="track-dot" aria-hidden="true">{i < current ? '✓' : i + 1}</span>
                    <span className="track-step-body">
                      <b>{STATUS_INFO[status]?.title ?? status}</b>
                      {i === current && <span className="track-when">Diperbarui {formatDate(order.updatedAt)}</span>}
                    </span>
                  </li>
                )
              })}
            </ol>

            <div className="success-box track-detail">
              <h3 className="bubble-title is-small">Detail Pesanan</h3>
              <ul>
                {order.items.map(item => <li key={item}>{item}</li>)}
              </ul>
              <dl>
                <dt>Total</dt>
                <dd>{formatRupiah(order.total)}</dd>
                <dt>Dipesan</dt>
                <dd>{formatDate(order.createdAt)}</dd>
                {order.pickup && (
                  <>
                    <dt>Pengambilan</dt>
                    <dd>{order.pickup}</dd>
                  </>
                )}
              </dl>
            </div>

            <div className="track-actions">
              <button type="button" className="btn-primary" disabled={loading} onClick={() => load(order.code, phone)}>
                {loading ? 'Memuat…' : 'Perbarui status'}
              </button>
              {askAdmin && (
                <a className="pill" href={askAdmin} target="_blank" rel="noreferrer">Tanya admin via WhatsApp</a>
              )}
              <button type="button" className="pill" onClick={reset}>Lacak pesanan lain</button>
            </div>
            {checkedAt && (
              <p className="muted hint is-center">
                Dicek {checkedAt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} · otomatis diperbarui tiap menit
              </p>
            )}
          </section>
        )}

        <p className="track-back">
          <Link href="/">← Kembali ke form pemesanan</Link>
        </p>
        <footer className="shop-footer">Snap it. Charm it. Keep it. #WearYourCharmera</footer>
      </div>
    </div>
  )
}
