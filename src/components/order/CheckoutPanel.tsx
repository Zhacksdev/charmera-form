/* eslint-disable @next/next/no-img-element -- the QRIS image may be a Supabase URL configured by the admin */
'use client'

import { useState } from 'react'
import { formatRupiah } from '@/lib/order'
import type { Tab } from '@/lib/order'

export interface CustomerInfo {
  name: string
  phone: string
  email: string
  instagram: string
  pickup: string
}

export type CheckoutErrors = Partial<Record<keyof CustomerInfo | 'proof' | 'cart', string>>

export interface ReceiptLine {
  tab: Tab
  title: string
  details: string[]
  price: number
}

export function CheckoutPanel({
  customer, onCustomerChange, pickupOptions, lines, total, qrisImage, proof, onProofChange, errors, submitting, submitError, onSubmit, onEdit,
}: {
  customer: CustomerInfo
  onCustomerChange: (customer: CustomerInfo) => void
  pickupOptions: string[]
  lines: ReceiptLine[]
  total: number
  qrisImage: string
  proof: File | null
  onProofChange: (file: File | null) => void
  errors: CheckoutErrors
  submitting: boolean
  submitError: string | null
  onSubmit: () => void
  onEdit: (tab: Tab) => void
}) {
  const [qrisMissing, setQrisMissing] = useState(false)
  const [downloading, setDownloading] = useState(false)

  // Paying from the same phone means scanning the QR from the gallery, so offer it as a file.
  // `<a download>` is ignored for cross-origin URLs (Supabase Storage), hence the blob round trip.
  async function downloadQris() {
    setDownloading(true)
    try {
      const res = await fetch(qrisImage)
      if (!res.ok) throw new Error(`QRIS ${res.status}`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `QRIS-Charmera.${blob.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png'}`
      document.body.appendChild(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch {
      window.open(qrisImage, '_blank', 'noopener')
    } finally {
      setDownloading(false)
    }
  }

  function field(key: keyof CustomerInfo, label: string, input: React.InputHTMLAttributes<HTMLInputElement>) {
    return (
      <label className="field">
        <span className="bubble-title is-label">{label}</span>
        <input
          {...input}
          value={customer[key]}
          onChange={e => onCustomerChange({ ...customer, [key]: e.target.value })}
          aria-invalid={Boolean(errors[key])}
        />
        {errors[key] && <span className="field-error">{errors[key]}</span>}
      </label>
    )
  }

  return (
    <form
      className="checkout-layout"
      noValidate
      onSubmit={e => {
        e.preventDefault()
        onSubmit()
      }}
    >
      <div className="form-grid checkout-fields">
        {field('name', 'Nama', { type: 'text', autoComplete: 'name', required: true })}
        {field('phone', 'No. Telepon', { type: 'tel', autoComplete: 'tel', inputMode: 'tel', placeholder: '08xxxxxxxxxx', required: true })}
        {field('email', 'Email', { type: 'email', autoComplete: 'email', inputMode: 'email' })}
        {field('instagram', 'Username IG', { type: 'text', autoCapitalize: 'none', placeholder: '@username' })}
        <label className="field is-wide">
          <span className="bubble-title is-label">Pengambilan</span>
          <select
            value={customer.pickup}
            onChange={e => onCustomerChange({ ...customer, pickup: e.target.value })}
            aria-invalid={Boolean(errors.pickup)}
            required
          >
            <option value="" disabled>Pilih cara ambil pesanan</option>
            {pickupOptions.map(option => <option key={option} value={option}>{option}</option>)}
          </select>
          {errors.pickup && <span className="field-error">{errors.pickup}</span>}
        </label>
      </div>

      <div className="checkout-side">
        <section className="dashed-box receipt" aria-labelledby="receipt-title">
          <h2 id="receipt-title" className="bubble-title is-small">Rincian Pembelian</h2>
          {lines.length === 0 && (
            <p className="muted">Belum ada pesanan. Pilih Italian Charm atau Keychain Custom dulu, ya.</p>
          )}
          {lines.map(line => (
            <div key={line.title} className="receipt-item">
              <div>
                <h3>{line.title}</h3>
                <ul>{line.details.map(detail => <li key={detail}>{detail}</li>)}</ul>
                <button type="button" className="receipt-edit" onClick={() => onEdit(line.tab)}>Ubah</button>
              </div>
              <span className="receipt-price">{formatRupiah(line.price)}</span>
            </div>
          ))}
          <div className="receipt-total">
            <span className="bubble-title is-small">Total Bayar</span>
            <span className="receipt-price">{formatRupiah(total)}</span>
          </div>
          {errors.cart && <p className="field-error">{errors.cart}</p>}
        </section>

        <section className="qris" aria-labelledby="qris-title">
          <h2 id="qris-title" className="bubble-title is-section">Scan QRIS untuk Bayar</h2>
          <div className="qris-frame">
            {qrisMissing ? (
              <p className="muted">QRIS belum tersedia. Admin akan kirim info pembayaran lewat WhatsApp.</p>
            ) : (
              <img src={qrisImage} alt="Kode QRIS Charmera" onError={() => setQrisMissing(true)} />
            )}
          </div>
          {!qrisMissing && (
            <>
              <button type="button" className="pill qris-download" onClick={downloadQris} disabled={downloading}>
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M8 2v8m0 0L4.5 6.5M8 10l3.5-3.5M2.5 13.5h11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {downloading ? 'Menyiapkan…' : 'Download QRIS'}
              </button>
              <p className="muted hint">Bayar dari HP ini? Download QRIS-nya, lalu scan dari galeri di aplikasi e-wallet atau m-banking.</p>
            </>
          )}
          <p className="section-note">Bayar sesuai total: {formatRupiah(total)}</p>
        </section>
      </div>

      <div className="checkout-proof">
        <label className="proof-input">
          <span className="bubble-title is-small">Upload Bukti Bayar</span>
          <span className="file-name">{proof ? proof.name : 'Pilih file'}</span>
          <input type="file" accept="image/*" hidden onChange={e => onProofChange(e.target.files?.[0] ?? null)} />
        </label>
        {errors.proof && <p className="field-error">{errors.proof}</p>}
      </div>

      <div className="submit-row">
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? 'Mengirim pesanan…' : 'Submit Pembayaran'}
        </button>
        {submitError && <p role="alert" className="form-alert">{submitError}</p>}
      </div>
    </form>
  )
}
