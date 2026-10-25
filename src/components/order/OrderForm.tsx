'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import type { Json, OrderInsert, Package } from '@/lib/supabase'
import { CHARM_TILE_HEIGHT, CHARM_TILE_WIDTH } from '@/lib/charm-catalog.generated'
import {
  DEFAULT_CONFIG, FALLBACK_CHARMS, FALLBACK_PACKAGES, SHAPE_LABEL,
  formatRupiah, isKeychainReady, keychainHasPhoto, keychainUnitPrice, newOrderCode, summarizeBracelet, toShopCharm, toShopConfig,
} from '@/lib/order'
import type { CharmPick, KeychainDraft, ShopCharm, ShopConfig, Tab } from '@/lib/order'
import { renderKeychainSide } from '@/lib/keychain'
import { uploadOrderFile, validateImage } from '@/lib/uploads'
import { BraceletBuilder } from './BraceletBuilder'
import { KeychainBuilder } from './KeychainBuilder'
import { CheckoutPanel } from './CheckoutPanel'
import { SummaryCard } from './SummaryCard'
import type { CheckoutErrors, CustomerInfo, ReceiptLine } from './CheckoutPanel'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const SETTINGS_COLUMNS = 'slot_count, batch_label, charm_price, custom_charm_price, keychain_price, keychain_double_price, pickup_options, qris_image_url'

const EMPTY_CUSTOMER: CustomerInfo = { name: '', phone: '', email: '', instagram: '', pickup: '' }
const EMPTY_KEYCHAIN: KeychainDraft = { shape: 'rect', doubleSided: false, qty: 1, photos: {} }

const TABS: { id: Tab; label: string }[] = [
  { id: 'charm', label: 'Italian Charm' },
  { id: 'keychain', label: 'Keychain Custom' },
  { id: 'checkout', label: 'Total Pembelian' },
]

export function OrderForm() {
  const [loading, setLoading] = useState(true)
  const [packages, setPackages] = useState<Package[]>(FALLBACK_PACKAGES)
  const [charms, setCharms] = useState<ShopCharm[]>(FALLBACK_CHARMS)
  const [config, setConfig] = useState<ShopConfig>(DEFAULT_CONFIG)
  const [tab, setTab] = useState<Tab>('charm')

  const [packageId, setPackageId] = useState('')
  const [slots, setSlots] = useState<(CharmPick | null)[]>(() => Array(DEFAULT_CONFIG.slotCount).fill(null))
  const [note, setNote] = useState('')
  const [keychain, setKeychain] = useState<KeychainDraft>(EMPTY_KEYCHAIN)

  const [customer, setCustomer] = useState<CustomerInfo>(EMPTY_CUSTOMER)
  const [proof, setProof] = useState<File | null>(null)
  const [errors, setErrors] = useState<CheckoutErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [completed, setCompleted] = useState<{ code: string; name: string } | null>(null)

  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tabsRef = useRef<HTMLElement>(null)

  const notify = useCallback((message: string) => {
    setToast(message)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2800)
  }, [])

  useEffect(() => {
    let mounted = true
    async function loadData() {
      try {
        await loadCatalog()
      } catch (error) {
        console.error(error)
      } finally {
        if (mounted) setLoading(false)
      }
    }
    async function loadCatalog() {
      const [pkgRes, charmRes, settingsRes] = await Promise.all([
        supabase.from('packages').select('*').eq('is_active', true).order('price'),
        supabase.from('charms').select('*').eq('is_active', true).order('sort_order'),
        supabase.from('settings').select(SETTINGS_COLUMNS).limit(1).maybeSingle(),
      ])
      if (!mounted) return
      const nextConfig = toShopConfig(settingsRes.data)
      setConfig(nextConfig)
      setSlots(Array(nextConfig.slotCount).fill(null))
      if (pkgRes.data?.length) setPackages(pkgRes.data)
      // Older rows only have emoji; use the photo catalog until charms with images are added.
      const withArt = (charmRes.data ?? []).filter(c => c.image_url || c.catalog_index)
      setCharms(
        withArt.length
          ? withArt.map((c, i) => toShopCharm(c, nextConfig.charmPrice, i))
          : FALLBACK_CHARMS.map(c => ({ ...c, price: nextConfig.charmPrice })),
      )
    }
    loadData()
    return () => { mounted = false }
  }, [])

  const charmsById = useMemo(() => new Map(charms.map(c => [c.id, c])), [charms])
  const selectedPackage = packages.find(p => p.id === packageId)
  const bracelet = summarizeBracelet(selectedPackage, slots, charmsById, config)
  const hasCharms = slots.some(Boolean)
  const keychainActive = keychainHasPhoto(keychain)
  const keychainUnit = keychainUnitPrice(keychain, config)
  const keychainTotal = keychainActive ? keychainUnit * keychain.qty : 0
  const total = bracelet.total + keychainTotal

  const lines: ReceiptLine[] = []
  if (selectedPackage) {
    const details = ['Plain Bracelet 1x']
    if (bracelet.catalogCount) {
      details.push(`Charm Non Custom ${bracelet.catalogCount}x${bracelet.includedUsed ? ` (${bracelet.includedUsed} termasuk set)` : ''}`)
    }
    if (bracelet.customCount) details.push(`Charm Custom ${bracelet.customCount}x`)
    lines.push({ tab: 'charm', title: `Italian Charm (${selectedPackage.name})`, details, price: bracelet.total })
  }
  if (keychainActive) {
    lines.push({
      tab: 'keychain',
      title: 'Keychain Custom',
      details: [`Keychain ${SHAPE_LABEL[keychain.shape]} ${keychain.doubleSided ? 'Bolak Balik' : 'Satu Sisi'} ${keychain.qty}x`],
      price: keychainTotal,
    })
  }

  function goTo(next: Tab) {
    setTab(next)
    const top = tabsRef.current ? tabsRef.current.getBoundingClientRect().top + window.scrollY - 12 : 0
    window.scrollTo({ top, behavior: 'smooth' })
  }

  function validate(): CheckoutErrors {
    const next: CheckoutErrors = {}
    if (lines.length === 0 && !hasCharms) next.cart = 'Keranjangmu masih kosong.'
    else if (hasCharms && !selectedPackage) next.cart = 'Pilih set gelangnya dulu di tab Italian Charm.'
    else if (keychainActive && !isKeychainReady(keychain)) next.cart = 'Keychain bolak balik butuh foto untuk dua sisi.'
    if (!customer.name.trim()) next.name = 'Isi nama kamu.'
    if (customer.phone.replace(/\D/g, '').length < 9) next.phone = 'Nomor telepon belum valid.'
    if (customer.email.trim() && !/^\S+@\S+\.\S+$/.test(customer.email.trim())) next.email = 'Format email belum benar.'
    if (!customer.pickup) next.pickup = 'Pilih cara pengambilan.'
    if (!proof) next.proof = 'Upload bukti bayar dulu, ya.'
    return next
  }

  async function handleSubmit() {
    const found = validate()
    setErrors(found)
    const first = Object.values(found)[0]
    if (first) {
      notify(first)
      return
    }

    setSubmitting(true)
    setSubmitError(null)
    try {
      const code = newOrderCode()
      const items: Json[] = []

      if (selectedPackage) {
        const slotItems = await Promise.all(slots.map(async (pick, i) => {
          if (!pick) return null
          if (pick.kind === 'custom') {
            const url = await uploadOrderFile(code, `charm-custom-${i + 1}`, pick.file)
            return { position: i + 1, kind: 'custom', photo_url: url, price: config.customCharmPrice }
          }
          const charm = charmsById.get(pick.charmId)
          return { position: i + 1, kind: 'catalog', charm_id: pick.charmId, name: charm?.name ?? null, image: charm?.image ?? null, price: charm?.price ?? config.charmPrice }
        }))
        items.push({
          type: 'italian_charm',
          package_id: selectedPackage.id,
          package_name: selectedPackage.name,
          package_price: selectedPackage.price,
          included_charms: bracelet.includedUsed,
          slot_count: slots.length,
          slots: slotItems,
          subtotal: bracelet.total,
        })
      }

      let keychainFrontUrl: string | null = null
      if (keychainActive) {
        const sides = keychain.doubleSided ? (['front', 'back'] as const) : (['front'] as const)
        const uploaded = await Promise.all(sides.map(async side => {
          const photo = keychain.photos[side]!
          const [print, original] = await Promise.all([
            renderKeychainSide(keychain.shape, photo).then(blob => uploadOrderFile(code, `keychain-${side}`, blob)),
            uploadOrderFile(code, `keychain-${side}-original`, photo.file),
          ])
          return { side, print_url: print, original_url: original, zoom: photo.zoom }
        }))
        keychainFrontUrl = uploaded[0].print_url
        items.push({
          type: 'keychain',
          shape: keychain.shape,
          double_sided: keychain.doubleSided,
          quantity: keychain.qty,
          unit_price: keychainUnit,
          sides: uploaded,
          subtotal: keychainTotal,
        })
      }

      const proofUrl = await uploadOrderFile(code, 'bukti-bayar', proof!)
      const pickedNames = slots.flatMap(pick => {
        if (!pick) return []
        return pick.kind === 'custom' ? ['Charm custom'] : [charmsById.get(pick.charmId)?.name ?? 'Charm']
      })

      const order: OrderInsert = {
        order_code: code,
        package_id: selectedPackage && UUID_PATTERN.test(selectedPackage.id) ? selectedPackage.id : null,
        package_name: lines.map(line => line.title).join(' + '),
        package_price: selectedPackage?.price ?? 0,
        charms: pickedNames,
        slot_count: selectedPackage ? slots.length : 0,
        photo_url: keychainFrontUrl,
        zoom_level: keychain.photos.front?.zoom ?? 1,
        quantity: keychainActive ? keychain.qty : 1,
        total_price: total,
        items,
        customer_name: customer.name.trim(),
        customer_whatsapp: customer.phone.replace(/\D/g, ''),
        customer_email: customer.email.trim() || null,
        customer_instagram: customer.instagram.trim().replace(/^@/, '') || null,
        customer_address: customer.pickup,
        pickup_method: customer.pickup,
        payment_proof_url: proofUrl,
        status: 'Menunggu verifikasi',
        notes: note.trim() || null,
      }
      const { error } = await supabase.from('orders').insert(order)
      if (error) throw error

      setCompleted({ code, name: customer.name.trim() })
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (error) {
      console.error(error)
      setSubmitError('Pesananmu belum terkirim. Cek koneksi lalu coba lagi, ya.')
    } finally {
      setSubmitting(false)
    }
  }

  function startOver() {
    for (const pick of slots) if (pick?.kind === 'custom') URL.revokeObjectURL(pick.preview)
    for (const photo of Object.values(keychain.photos)) if (photo) URL.revokeObjectURL(photo.src)
    setPackageId('')
    setSlots(Array(config.slotCount).fill(null))
    setNote('')
    setKeychain(EMPTY_KEYCHAIN)
    setCustomer(EMPTY_CUSTOMER)
    setProof(null)
    setErrors({})
    setCompleted(null)
    setTab('charm')
  }

  const cartCount = lines.length
  const summary = <SummaryCard lines={lines} total={total} onCheckout={() => goTo('checkout')} />

  return (
    <div className="shop" style={{ '--charm-aspect': `${CHARM_TILE_WIDTH} / ${CHARM_TILE_HEIGHT}` } as React.CSSProperties}>
      <div className="shop-inner">
        <header className="hero">
          <Image className="hero-mascot is-left" src="/assets/maskot-page.webp" alt="" width={900} height={755} priority />
          <Image className="hero-mascot is-right" src="/assets/maskot-page.webp" alt="" width={900} height={755} priority />
          <Image className="hero-logo" src="/assets/logo.webp" alt="Charmera – Wear your memories." width={410} height={312} priority />
          <h1 className="bubble-title is-hero">{config.batchLabel}</h1>
        </header>

        {completed ? (
          <section className="success" aria-live="polite">
            <Image src="/assets/maskot-thx.webp" alt="" width={431} height={482} />
            <h2 className="bubble-title is-section">Makasih, {completed.name}!</h2>
            <p>Pesananmu sudah masuk. Kami cek pembayaranmu dulu, lalu kabari lewat WhatsApp.</p>
            <p className="order-code">{completed.code}</p>
            <p className="muted">Simpan kode ini kalau mau tanya soal pesananmu.</p>
            <button type="button" className="btn-primary" onClick={startOver}>Buat pesanan baru</button>
          </section>
        ) : (
          <>
            <nav ref={tabsRef} className="tabs" aria-label="Langkah pemesanan">
              {TABS.map(t => (
                <button
                  key={t.id}
                  type="button"
                  className={`tab ${tab === t.id ? 'is-active' : ''}`}
                  aria-current={tab === t.id ? 'page' : undefined}
                  onClick={() => goTo(t.id)}
                >
                  {t.label}
                  {t.id === 'checkout' && cartCount > 0 && (
                    <span className="tab-badge" aria-label={`${cartCount} item`}>{cartCount}</span>
                  )}
                </button>
              ))}
            </nav>

            {loading && <p className="muted hint is-center">Memuat katalog…</p>}

            {tab === 'charm' && (
              <BraceletBuilder
                packages={packages}
                charms={charms}
                charmsById={charmsById}
                config={config}
                packageId={packageId}
                onSelectPackage={id => setPackageId(current => (current === id ? '' : id))}
                slots={slots}
                onSlotsChange={setSlots}
                note={note}
                onNoteChange={setNote}
                notify={notify}
                aside={summary}
              />
            )}

            {tab === 'keychain' && <KeychainBuilder draft={keychain} onChange={setKeychain} notify={notify} aside={summary} />}

            {tab === 'checkout' && (
              <CheckoutPanel
                customer={customer}
                onCustomerChange={setCustomer}
                pickupOptions={config.pickupOptions}
                lines={lines}
                total={total}
                qrisImage={config.qrisImage}
                proof={proof}
                onProofChange={file => {
                  const problem = file && validateImage(file)
                  if (problem) notify(problem)
                  else setProof(file)
                }}
                errors={errors}
                submitting={submitting}
                submitError={submitError}
                onSubmit={handleSubmit}
                onEdit={goTo}
              />
            )}
          </>
        )}

        <footer className="shop-footer">Snap it. Charm it. Keep it. #WearYourCharmera</footer>
      </div>

      {!completed && tab !== 'checkout' && (
        <div className="bottom-bar">
          <div className="bottom-bar-inner">
            <p className="bottom-total" aria-live="polite">
              <span>Total Pembelian</span>
              <strong>{formatRupiah(total)}</strong>
            </p>
            <div className="bottom-cta">
              <Image className="bottom-mascot" src="/assets/maskot-thx.webp" alt="" width={431} height={482} />
              <button type="button" className="btn-primary" onClick={() => goTo('checkout')}>Checkout</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  )
}
