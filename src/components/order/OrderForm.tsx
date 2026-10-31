'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import type { Json, OrderInsert, Package } from '@/lib/supabase'
import { CHARM_TILE_HEIGHT, CHARM_TILE_WIDTH } from '@/lib/charm-catalog.generated'
import {
  DEFAULT_CONFIG, FALLBACK_CHARMS, FALLBACK_PACKAGES, SHAPE_LABEL,
  formatRupiah, isKeychainReady, keychainCharge, keychainHasPhoto, keychainMissingMessage, keychainReadyCount, keychainUnitPrice,
  newOrderCode, packageContents, packageShortfall, resizeBoard, sortCharms, summarizeBracelet, toShopCharm, toShopConfig, withKeychainQty,
} from '@/lib/order'
import type { CharmPick, KeychainDraft, ShopCharm, ShopConfig, Tab } from '@/lib/order'
import { renderBoardLayout, renderKeychainSide } from '@/lib/keychain'
import type { LayoutTile } from '@/lib/keychain'
import { uploadOrderFile, validateImage } from '@/lib/uploads'
import { BraceletBuilder } from './BraceletBuilder'
import { KeychainBuilder } from './KeychainBuilder'
import { CheckoutPanel } from './CheckoutPanel'
import { SummaryCard } from './SummaryCard'
import { SuccessPanel } from './SuccessPanel'
import type { CompletedOrder } from './SuccessPanel'
import type { CheckoutErrors, CustomerInfo, ReceiptLine } from './CheckoutPanel'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const SETTINGS_COLUMNS = 'slot_count, batch_label, charm_price, custom_charm_price, keychain_price, keychain_double_price, pickup_options, qris_image_url'
// Added later; read separately so the form keeps working before schema.sql is re-run.
const NEWER_SETTINGS_COLUMNS = `${SETTINGS_COLUMNS}, keychain_shapes, whatsapp_number, instagram_username, tiktok_username`

async function loadSettings() {
  const res = await supabase.from('settings').select(NEWER_SETTINGS_COLUMNS).limit(1).maybeSingle()
  return res.error ? supabase.from('settings').select(SETTINGS_COLUMNS).limit(1).maybeSingle() : res
}

const EMPTY_CUSTOMER: CustomerInfo = { name: '', phone: '', email: '', instagram: '', pickup: '' }
const EMPTY_KEYCHAIN: KeychainDraft = { shape: 'rect', doubleSided: false, qty: 0, photos: [] }

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
  const [tray, setTray] = useState<CharmPick[]>([])
  const [note, setNote] = useState('')
  const [keychain, setKeychain] = useState<KeychainDraft>(EMPTY_KEYCHAIN)

  const [customer, setCustomer] = useState<CustomerInfo>(EMPTY_CUSTOMER)
  const [proof, setProof] = useState<File | null>(null)
  const [errors, setErrors] = useState<CheckoutErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [completed, setCompleted] = useState<CompletedOrder | null>(null)
  // Shown when the chosen set still misses something; 'checkout' still lets the customer look at the total.
  const [shortfallFor, setShortfallFor] = useState<'checkout' | 'submit' | null>(null)

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
        loadSettings(),
      ])
      if (!mounted) return
      const nextConfig = toShopConfig(settingsRes.data)
      setConfig(nextConfig)
      setSlots(Array(nextConfig.slotCount).fill(null))
      setKeychain(k => (nextConfig.keychainShapes.includes(k.shape) ? k : { ...k, shape: nextConfig.keychainShapes[0] }))
      if (pkgRes.data?.length) setPackages(pkgRes.data)
      // Older rows only have emoji; use the photo catalog until charms with images are added.
      const withArt = sortCharms(charmRes.data ?? []).filter(c => c.image_url || c.catalog_index)
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
  const allPicks = [...slots, ...tray]
  const bracelet = summarizeBracelet(selectedPackage, allPicks, charmsById, config)
  const hasCharms = allPicks.some(Boolean)
  const contents = packageContents(selectedPackage)
  const includedKeychains = selectedPackage ? contents.keychains : 0
  const keychainActive = keychainHasPhoto(keychain)
  const keychainUnit = keychainUnitPrice(keychain, config)
  const keychainCost = keychainCharge(keychain, config, includedKeychains)
  const keychainTotal = keychainCost.total
  const total = bracelet.total + keychainTotal
  const shortfall = packageShortfall(selectedPackage, allPicks, keychain)
  if (tray.length) shortfall.unshift(`Pasang ${tray.length} charm yang sudah kamu pilih ke gelangnya.`)

  const lines: ReceiptLine[] = []
  if (selectedPackage) {
    const details = [`Plain Bracelet ${contents.bracelets}x`]
    if (bracelet.catalogCount) {
      details.push(`Charm Non Custom ${bracelet.catalogCount}x${bracelet.includedUsed ? ` (${bracelet.includedUsed} termasuk set)` : ''}`)
    }
    if (bracelet.customCount) {
      details.push(`Charm Custom ${bracelet.customCount}x${bracelet.includedCustomUsed ? ` (${bracelet.includedCustomUsed} termasuk set)` : ''}`)
    }
    lines.push({ tab: 'charm', title: `Italian Charm (${selectedPackage.name})`, details, price: bracelet.total })
  }
  if (keychainActive) {
    lines.push({
      tab: keychainCost.included ? 'charm' : 'keychain',
      title: 'Keychain Custom',
      details: [
        `Keychain ${SHAPE_LABEL[keychain.shape]} ${keychain.doubleSided ? 'Bolak Balik' : 'Satu Sisi'} ${keychain.qty}x${keychainCost.included ? ` (${keychainCost.included} termasuk set)` : ''}`,
      ],
      price: keychainTotal,
    })
  }

  function goTo(next: Tab) {
    setTab(next)
    const top = tabsRef.current ? tabsRef.current.getBoundingClientRect().top + window.scrollY - 12 : 0
    window.scrollTo({ top, behavior: 'smooth' })
  }

  // Going to checkout with an unfinished set first shows what is missing.
  function requestCheckout() {
    if (shortfall.length && tab !== 'checkout') setShortfallFor('checkout')
    else goTo('checkout')
  }

  function completeSet() {
    setShortfallFor(null)
    setTab('charm')
    const keychainMissing = contents.keychains > 0 && !isKeychainReady(keychain)
    // Wait for the charm tab to render before scrolling to the part that needs filling.
    setTimeout(() => {
      const target = keychainMissing ? document.getElementById('package-keychain') : tabsRef.current
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
  }

  function selectPackage(id: string) {
    const nextId = packageId === id ? '' : id
    const next = packages.find(p => p.id === nextId)
    const nextContents = packageContents(next)
    const board = resizeBoard(slots, tray, nextContents.bracelets * config.slotCount, nextContents.bracelets === 1)
    for (const pick of board.dropped) {
      if (pick.kind !== 'custom') continue
      URL.revokeObjectURL(pick.preview)
      URL.revokeObjectURL(pick.photo.src)
    }
    if (board.dropped.length) notify(`${board.dropped.length} charm dilepas karena tidak muat di set ini.`)
    setPackageId(nextId)
    setSlots(board.slots)
    setTray(board.tray)
    if (next && keychain.qty < nextContents.keychains) setKeychain(k => withKeychainQty(k, nextContents.keychains).draft)
  }

  function validate(): CheckoutErrors {
    const next: CheckoutErrors = {}
    if (lines.length === 0 && !hasCharms) next.cart = 'Keranjangmu masih kosong.'
    else if (hasCharms && !selectedPackage) next.cart = 'Pilih set gelangnya dulu di tab Italian Charm.'
    else if (shortfall.length) next.cart = shortfall[0]
    else if (keychainActive && !isKeychainReady(keychain)) next.cart = keychainMissingMessage(keychain)
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
    if (shortfall.length) {
      setShortfallFor('submit')
      return
    }
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
          // position counts within its bracelet (1..slot_count); bracelet is 1-based.
          const where = { bracelet: Math.floor(i / config.slotCount) + 1, position: (i % config.slotCount) + 1 }
          if (pick.kind === 'custom') {
            const [url, original] = await Promise.all([
              uploadOrderFile(code, `charm-custom-${i + 1}`, pick.crop),
              uploadOrderFile(code, `charm-custom-${i + 1}-original`, pick.photo.file),
            ])
            return { ...where, kind: 'custom', photo_url: url, original_url: original, zoom: pick.photo.zoom, price: config.customCharmPrice }
          }
          const charm = charmsById.get(pick.charmId)
          return { ...where, kind: 'catalog', charm_id: pick.charmId, name: charm?.name ?? null, image: charm?.image ?? null, price: charm?.price ?? config.charmPrice }
        }))
        // A picture of the arrangement for the admin; the order still goes through if it can't be made.
        let layoutUrl: string | null = null
        try {
          const tiles: LayoutTile[] = slots.map(pick => {
            if (!pick) return null
            if (pick.kind === 'custom') return { src: pick.preview, framed: true, label: 'Custom' }
            const charm = charmsById.get(pick.charmId)
            return { src: charm?.image ?? null, framed: false, label: charm?.emoji || charm?.name || 'Charm' }
          })
          layoutUrl = await uploadOrderFile(code, 'susunan-charm', await renderBoardLayout(tiles, config.slotCount))
        } catch (error) {
          console.warn('Gambar susunan charm gagal dibuat', error)
        }
        items.push({
          type: 'italian_charm',
          layout_url: layoutUrl,
          package_id: selectedPackage.id,
          package_name: selectedPackage.name,
          package_price: selectedPackage.price,
          bracelet_count: contents.bracelets,
          included_charms: bracelet.includedUsed,
          included_custom_charms: bracelet.includedCustomUsed,
          slot_count: config.slotCount,
          slots: slotItems,
          subtotal: bracelet.total,
        })
      }

      let keychainFrontUrl: string | null = null
      if (keychainActive) {
        const sides = keychain.doubleSided ? (['front', 'back'] as const) : (['front'] as const)
        // Every keychain carries its own photos; `index` is 1-based.
        const keychains = await Promise.all(keychain.photos.slice(0, keychain.qty).map(async (photos, k) => ({
          index: k + 1,
          sides: await Promise.all(sides.map(async side => {
            const photo = photos[side]!
            const name = `keychain-${k + 1}-${side}`
            const [print, original] = await Promise.all([
              renderKeychainSide(keychain.shape, photo).then(blob => uploadOrderFile(code, name, blob)),
              uploadOrderFile(code, `${name}-original`, photo.file),
            ])
            return { side, print_url: print, original_url: original, zoom: photo.zoom }
          })),
        })))
        keychainFrontUrl = keychains[0].sides[0].print_url
        items.push({
          type: 'keychain',
          shape: keychain.shape,
          double_sided: keychain.doubleSided,
          quantity: keychain.qty,
          unit_price: keychainUnit,
          included_in_package: keychainCost.included,
          keychains,
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
        slot_count: selectedPackage ? config.slotCount : 0,
        photo_url: keychainFrontUrl,
        zoom_level: keychain.photos[0]?.front?.zoom ?? 1,
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

      setCompleted({ code, name: customer.name.trim(), total })
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (error) {
      console.error(error)
      setSubmitError('Pesananmu belum terkirim. Cek koneksi lalu coba lagi, ya.')
    } finally {
      setSubmitting(false)
    }
  }

  function startOver() {
    for (const pick of allPicks) {
      if (pick?.kind !== 'custom') continue
      URL.revokeObjectURL(pick.preview)
      URL.revokeObjectURL(pick.photo.src)
    }
    for (const sides of keychain.photos) for (const photo of Object.values(sides)) if (photo) URL.revokeObjectURL(photo.src)
    setPackageId('')
    setSlots(Array(config.slotCount).fill(null))
    setTray([])
    setNote('')
    setKeychain({ ...EMPTY_KEYCHAIN, shape: config.keychainShapes[0] })
    setCustomer(EMPTY_CUSTOMER)
    setProof(null)
    setErrors({})
    setCompleted(null)
    setTab('charm')
  }

  const cartCount = lines.length
  const summary = <SummaryCard lines={lines} total={total} onCheckout={requestCheckout} />
  const keychainNote = includedKeychains > 0 && (
    <p className="muted hint">
      {includedKeychains}x keychain sudah termasuk {selectedPackage?.name}; keychain selebihnya {formatRupiah(keychainUnit)}/pcs.
      {keychain.doubleSided && config.keychainDoublePrice > config.keychainPrice && (
        <> Bolak balik menambah {formatRupiah(config.keychainDoublePrice - config.keychainPrice)}/pcs.</>
      )}
    </p>
  )

  return (
    <div className="shop" style={{ '--charm-aspect': `${CHARM_TILE_WIDTH} / ${CHARM_TILE_HEIGHT}` } as React.CSSProperties}>
      <div className="shop-inner">
        <header className="hero">
          <Image className="hero-logo" src="/assets/logo.webp" alt="Charmera – Wear your memories." width={410} height={312} priority />
          <h1 className="bubble-title is-hero">{config.batchLabel}</h1>
        </header>

        {completed ? (
          <SuccessPanel order={completed} config={config} onStartOver={startOver} />
        ) : (
          <>
            <nav ref={tabsRef} className="tabs" aria-label="Langkah pemesanan">
              {TABS.map(t => (
                <button
                  key={t.id}
                  type="button"
                  className={`tab ${tab === t.id ? 'is-active' : ''}`}
                  aria-current={tab === t.id ? 'page' : undefined}
                  onClick={() => (t.id === 'checkout' ? requestCheckout() : goTo(t.id))}
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
                onSelectPackage={selectPackage}
                slots={slots}
                tray={tray}
                onBoardChange={(nextSlots, nextTray) => {
                  setSlots(nextSlots)
                  setTray(nextTray)
                }}
                note={note}
                onNoteChange={setNote}
                notify={notify}
                aside={summary}
                keychainReady={keychainReadyCount(keychain)}
                keychainQty={keychainActive || includedKeychains > 0 ? keychain.qty : 0}
                packageKeychain={includedKeychains > 0 && (
                  <KeychainBuilder
                    embedded
                    draft={keychain}
                    shapes={config.keychainShapes}
                    onChange={setKeychain}
                    notify={notify}
                    minQty={includedKeychains}
                    note={keychainNote}
                  />
                )}
              />
            )}

            {tab === 'keychain' && (
              <KeychainBuilder
                draft={keychain}
                shapes={config.keychainShapes}
                onChange={setKeychain}
                notify={notify}
                aside={summary}
                minQty={includedKeychains}
                note={keychainNote}
              />
            )}

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
              <button type="button" className="btn-primary" onClick={requestCheckout}>Checkout</button>
            </div>
          </div>
        </div>
      )}

      {shortfallFor && selectedPackage && (
        <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setShortfallFor(null) }}>
          <div
            className="modal-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="shortfall-title"
            onKeyDown={e => { if (e.key === 'Escape') setShortfallFor(null) }}
          >
            <Image className="modal-mascot" src="/assets/maskot-thx.webp" alt="" width={431} height={482} />
            <h2 id="shortfall-title" className="bubble-title is-section">Paketmu belum lengkap</h2>
            <p>Isi dulu bagian ini sebelum bayar, ya. Semuanya sudah termasuk harga {selectedPackage.name}.</p>
            <ul className="modal-list">
              {shortfall.map(item => <li key={item}>{item}</li>)}
            </ul>
            <div className="modal-actions">
              {shortfallFor === 'checkout' && (
                <button
                  type="button"
                  className="pill"
                  onClick={() => {
                    setShortfallFor(null)
                    goTo('checkout')
                  }}
                >
                  Lihat total dulu
                </button>
              )}
              <button type="button" className="btn-primary" onClick={completeSet} autoFocus>Lengkapi sekarang</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  )
}
