'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import type { Package } from '@/lib/supabase'
import { formatRupiah, formatShortPrice, newUid, packageContents, packageItems } from '@/lib/order'
import type { CharmPick, ShopCharm, ShopConfig, SidePhoto } from '@/lib/order'
import { loadImage, newSidePhoto, renderCharmPhoto } from '@/lib/keychain'
import { validateImage } from '@/lib/uploads'
import { AddSlotButton, CharmArt, Chevron, PickArt, PhotoLink } from './parts'
import { PhotoCropDialog } from './PhotoCropDialog'
import { SlotBoard } from './SlotBoard'

const PAGE_SIZE = 48

export function BraceletBuilder({
  packages, charms, charmsById, config, packageId, onSelectPackage, slots, tray, onBoardChange, note, onNoteChange, notify, aside,
  keychainReady, keychainQty, packageKeychain,
}: {
  aside?: React.ReactNode
  // Keychains with all their photos, out of `keychainQty` keychains in the order (0 when none).
  keychainReady: number
  keychainQty: number
  packageKeychain?: React.ReactNode
  packages: Package[]
  charms: ShopCharm[]
  charmsById: Map<string, ShopCharm>
  config: ShopConfig
  packageId: string
  onSelectPackage: (id: string) => void
  slots: (CharmPick | null)[]
  // Picked charms not yet placed on a bracelet; only used when the set has several bracelets.
  tray: CharmPick[]
  onBoardChange: (slots: (CharmPick | null)[], tray: CharmPick[]) => void
  note: string
  onNoteChange: (note: string) => void
  notify: (message: string) => void
}) {
  const [page, setPage] = useState(0)
  const [setsPage, setSetsPage] = useState(0)
  const [setPages, setSetPages] = useState(1)
  const setsRef = useRef<HTMLDivElement>(null)
  const catalogRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  // The custom charm being framed in the crop dialog; `uid` is null for a new upload.
  const [editing, setEditing] = useState<{ uid: string | null; photo: SidePhoto } | null>(null)
  const [flipped, setFlipped] = useState<string | null>(null)
  const [unlockedFor, setUnlockedFor] = useState<string | null>(null)

  const selected = packages.find(p => p.id === packageId)
  const contents = packageContents(selected)
  // A set of custom photo charms locks the catalog behind a notice; catalog charms are then paid add-ons.
  const catalogLocked = Boolean(selected && contents.customCharms > 0 && contents.charms === 0 && unlockedFor !== selected.id)

  const pageCount = Math.max(1, Math.ceil(charms.length / PAGE_SIZE))
  const visibleCharms = charms.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  // How many cards fit per view depends on the screen, so the dots follow the scroller's real width.
  useEffect(() => {
    const el = setsRef.current
    if (!el) return
    const measure = () => setSetPages(Math.max(1, Math.ceil(el.scrollWidth / el.clientWidth - 0.05)))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [packages.length])
  // With several bracelets, picks wait in the tray and the customer places them on each bracelet.
  const useTray = contents.bracelets > 1
  const picks = [...slots.filter((s): s is CharmPick => s !== null), ...tray]
  const customPicks = picks.filter(p => p.kind === 'custom')
  const pickCounts = new Map<string, number>()
  for (const p of picks) if (p.kind === 'catalog') pickCounts.set(p.charmId, (pickCounts.get(p.charmId) ?? 0) + 1)
  const catalogCount = picks.length - customPicks.length
  // A custom set puts its photo charms first; the catalog below is then for add-ons.
  const customFirst = Boolean(selected && contents.customCharms > 0)
  const includedKeychains = Math.min(contents.keychains, keychainQty)
  const checklist = selected
    ? [
        { label: 'Italian Charm', done: true, count: `${contents.bracelets}x Plain Bracelet` },
        contents.customCharms > 0 && { label: 'Charm custom', done: customPicks.length >= contents.customCharms, count: `${Math.min(customPicks.length, contents.customCharms)}/${contents.customCharms}` },
        contents.charms > 0 && { label: 'Charm non custom', done: catalogCount >= contents.charms, count: `${Math.min(catalogCount, contents.charms)}/${contents.charms}` },
        contents.keychains > 0 && {
          label: 'Keychain custom',
          done: keychainReady >= contents.keychains,
          count: `${Math.min(keychainReady, contents.keychains)}/${contents.keychains}`,
        },
      ].filter((item): item is { label: string; done: boolean; count: string } => Boolean(item))
    : []
  const addOns = selected
    ? [
        { label: 'Charm custom', count: customPicks.length - Math.min(customPicks.length, contents.customCharms) },
        { label: 'Charm non custom', count: catalogCount - Math.min(catalogCount, contents.charms) },
        { label: 'Keychain custom', count: keychainQty - includedKeychains },
      ].filter(item => item.count > 0)
    : []

  function isFull() {
    if (picks.length < slots.length) return false
    notify(`Semua slot gelangmu (${slots.length}) sudah terisi. Lepas satu dulu, ya.`)
    return true
  }

  function place(pick: CharmPick) {
    if (isFull()) return false
    if (useTray) {
      onBoardChange(slots, [...tray, pick])
      if (tray.length === 0) notify('Charm masuk ke daftar. Pasang ke gelangnya di bagian Kustomisasi, ya.')
      return true
    }
    const next = [...slots]
    next[next.indexOf(null)] = pick
    onBoardChange(next, tray)
    return true
  }

  function placeAll() {
    const next = [...slots]
    const rest = tray.filter(pick => {
      const free = next.indexOf(null)
      if (free === -1) return true
      next[free] = pick
      return false
    })
    onBoardChange(next, rest)
  }

  function remove(uid: string) {
    const target = picks.find(p => p.uid === uid)
    if (target?.kind === 'custom') {
      URL.revokeObjectURL(target.preview)
      URL.revokeObjectURL(target.photo.src)
    }
    onBoardChange(slots.map(s => (s?.uid === uid ? null : s)), tray.filter(p => p.uid !== uid))
  }

  function committedSrc(uid: string | null) {
    const pick = uid ? picks.find(p => p.uid === uid) : null
    return pick?.kind === 'custom' ? pick.photo.src : null
  }

  // Free a photo that only lived in the dialog, never one a slot still shows.
  function discardDraft(draft: { uid: string | null; photo: SidePhoto }) {
    if (draft.photo.src !== committedSrc(draft.uid)) URL.revokeObjectURL(draft.photo.src)
  }

  function uploadNew() {
    if (!isFull()) fileRef.current?.click()
  }

  async function handleFile(file: File | undefined) {
    if (!file) return
    const problem = validateImage(file)
    if (problem) {
      notify(problem)
      return
    }
    const src = URL.createObjectURL(file)
    try {
      const photo = newSidePhoto(file, src, await loadImage(src))
      if (editing) discardDraft(editing)
      setEditing({ uid: editing?.uid ?? null, photo })
    } catch {
      URL.revokeObjectURL(src)
      notify('Foto ini tidak bisa dibuka. Coba foto lain, ya.')
    }
  }

  function cancelEditing() {
    if (editing) discardDraft(editing)
    setEditing(null)
  }

  async function saveEditing() {
    if (!editing) return
    let crop: Blob
    try {
      crop = await renderCharmPhoto(editing.photo)
    } catch {
      notify('Foto gagal disiapkan. Coba lagi, ya.')
      return
    }
    const preview = URL.createObjectURL(crop)
    const { uid, photo } = editing
    if (uid) {
      const update = <T extends CharmPick | null>(s: T): T => {
        if (s?.uid !== uid || s.kind !== 'custom') return s
        URL.revokeObjectURL(s.preview)
        if (s.photo.src !== photo.src) URL.revokeObjectURL(s.photo.src)
        return { ...s, photo, crop, preview }
      }
      onBoardChange(slots.map(update), tray.map(update))
    } else if (!place({ uid: newUid(), kind: 'custom', photo, crop, preview })) {
      URL.revokeObjectURL(preview)
      URL.revokeObjectURL(photo.src)
    }
    setEditing(null)
  }

  function scrollSets(toPage: number) {
    const el = setsRef.current
    if (el) el.scrollTo({ left: toPage * el.clientWidth, behavior: 'smooth' })
  }

  const customSection = (
    <section className="section" aria-labelledby="custom-title">
      <div className="custom-row">
        <div>
          <h2 id="custom-title" className="bubble-title is-section">Custom Charm</h2>
          <p className="section-note">
            {selected && contents.customCharms > 0
              ? `${contents.customCharms} charm custom termasuk paket, selebihnya ${formatShortPrice(config.customCharmPrice)}/charm`
              : `Harga tiap charm ${formatShortPrice(config.customCharmPrice)}`}
          </p>
        </div>
        <div className="custom-list">
          {customPicks.map(pick => (
            <span key={pick.uid} className="picked-item">
              <button
                type="button"
                className="custom-photo-btn"
                onClick={() => pick.kind === 'custom' && setEditing({ uid: pick.uid, photo: pick.photo })}
                aria-label="Atur posisi foto charm custom"
              >
                <PhotoLink src={pick.kind === 'custom' ? pick.preview : undefined} alt="Charm custom" />
              </button>
              <button type="button" className="remove-dot" onClick={() => remove(pick.uid)} aria-label="Hapus charm custom">×</button>
            </span>
          ))}
          <AddSlotButton onClick={uploadNew} label="Upload Foto Charm" />
        </div>
      </div>
      <p className="muted hint">Setelah upload, atur posisi dan zoom foto supaya pas di charm. Ketuk fotonya untuk mengatur ulang.</p>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={e => {
          handleFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />
    </section>
  )

  return (
    <div className="split-layout">
      <div className="split-main">
        <section aria-label="Pilih set">
          <div
            ref={setsRef}
            className="sets"
            onScroll={e => setSetsPage(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
          >
            {packages.map(pkg => {
              const active = packageId === pkg.id
              const isFlipped = flipped === pkg.id
              return (
                <div key={pkg.id} className={`set-card ${active ? 'is-active' : ''} ${isFlipped ? 'is-flipped' : ''}`}>
                  <div className="set-card-inner">
                    {/* Front: name, contents, price and mascot. Tapping either face picks the set. */}
                    <button
                      type="button"
                      className="set-face"
                      aria-pressed={active}
                      aria-hidden={isFlipped}
                      tabIndex={isFlipped ? -1 : 0}
                      onClick={() => onSelectPackage(pkg.id)}
                    >
                      <h2 className="bubble-title is-small">{pkg.name}</h2>
                      <span className="set-items">
                        {packageItems(pkg).map(item => (
                          <span key={item}><span className="chip">{item}</span></span>
                        ))}
                      </span>
                      <span className="set-price">{formatRupiah(pkg.price)}</span>
                      <Image className="set-mascot" src="/assets/maskot-set.webp" alt="" width={158} height={93} />
                    </button>
                    {/* Back: the admin's description paragraph. */}
                    {pkg.description && (
                      <button
                        type="button"
                        className="set-face is-back"
                        aria-pressed={active}
                        aria-hidden={!isFlipped}
                        tabIndex={isFlipped ? 0 : -1}
                        onClick={() => onSelectPackage(pkg.id)}
                      >
                        <span className="set-back-title">{pkg.name}</span>
                        <span className="set-description">{pkg.description}</span>
                      </button>
                    )}
                  </div>
                  {pkg.description && (
                    <button
                      type="button"
                      className="set-flip"
                      onClick={() => setFlipped(isFlipped ? null : pkg.id)}
                      aria-label={isFlipped ? `Tutup deskripsi ${pkg.name}` : `Lihat deskripsi ${pkg.name}`}
                    >
                      {isFlipped ? '↺ Kembali' : 'ⓘ Detail'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
          {setPages > 1 && (
            <div className="dots">
              {Array.from({ length: setPages }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  className={`dot ${setsPage === i ? 'is-active' : ''}`}
                  aria-label={`Lihat set halaman ${i + 1}`}
                  onClick={() => scrollSets(i)}
                />
              ))}
            </div>
          )}
          {selected && (
            <div className="package-checklist" aria-live="polite">
              <p className="bubble-title is-small">Isi paket {selected.name}</p>
              <ul>
                {checklist.map(item => (
                  <li key={item.label} className={item.done ? 'is-done' : ''}>
                    <span aria-hidden="true">{item.done ? '✓' : '○'}</span> {item.label} <b>{item.count}</b>
                  </li>
                ))}
              </ul>
              <p className="package-checklist-sub">Add-on lainnya</p>
              {addOns.length ? (
                <ul>
                  {addOns.map(item => (
                    <li key={item.label}>
                      <span aria-hidden="true">+</span> {item.label} <b>{item.count}x</b>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">Belum ada add-on. Charm atau keychain tambahan akan muncul di sini.</p>
              )}
              {contents.bracelets > 1 && (
                <p className="muted">
                  Paketmu berisi {contents.bracelets} gelang. Pilih charm-mu dulu, lalu pasang ke masing-masing gelang di bagian Kustomisasi.
                </p>
              )}
            </div>
          )}
        </section>

        {customFirst && customSection}

        <section className="section" ref={catalogRef} aria-labelledby="catalog-title">
          <div className="section-head">
            <button type="button" className="arrow-btn" onClick={() => setPage(p => p - 1)} disabled={page === 0} aria-label="Charm sebelumnya">
              <Chevron direction="left" />
            </button>
            <h2 id="catalog-title" className="bubble-title is-section">{customFirst ? 'Tambah Charm Non Custom' : 'Pilih Charm Favoritmu'}</h2>
            <button type="button" className="arrow-btn" onClick={() => setPage(p => p + 1)} disabled={page >= pageCount - 1} aria-label="Charm berikutnya">
              <Chevron direction="right" />
            </button>
          </div>
          <p className="section-note is-center">
            Harga tiap charm {formatShortPrice(config.charmPrice)}
            {selected && contents.charms === 0 && contents.customCharms > 0 && ' (add-on)'}
          </p>
          <div className={`catalog-lock-wrap ${catalogLocked ? 'is-locked' : ''}`}>
            {catalogLocked && selected && (
              <div className="catalog-lock" role="note">
                <span className="catalog-lock-icon" aria-hidden="true">🔒</span>
                <p className="bubble-title is-small">Paketmu tersedia custom!</p>
                <p>
                  {selected.name} sudah termasuk {contents.customCharms} charm custom dari fotomu. Upload fotonya di bagian Custom Charm di atas.
                </p>
                <p>
                  Kamu tetap bisa memilih charm non-custom sebagai add-on ({formatShortPrice(config.charmPrice)}/charm).
                </p>
                <span className="catalog-lock-actions">
                  <button type="button" className="btn-primary" onClick={uploadNew}>Upload foto charm</button>
                  <button type="button" className="pill" onClick={() => setUnlockedFor(selected.id)}>Pilih charm add-on</button>
                </span>
              </div>
            )}
            <div className="charm-grid" inert={catalogLocked}>
              {visibleCharms.map(charm => {
                const count = pickCounts.get(charm.id) ?? 0
                return (
                  <button
                    key={charm.id}
                    type="button"
                    className={`charm-btn ${count ? 'is-picked' : ''}`}
                    onClick={() => place({ uid: newUid(), kind: 'catalog', charmId: charm.id })}
                    aria-label={`Tambah ${charm.name}${count ? `, sudah dipilih ${count}` : ''}`}
                    title={charm.name}
                  >
                    <CharmArt charm={charm} />
                    {count > 0 && <span className="charm-count" aria-hidden="true">{count}</span>}
                  </button>
                )
              })}
            </div>
          </div>
        </section>

        {packageKeychain && (
          <section id="package-keychain" className="section" aria-labelledby="package-keychain-title">
            <div className="section-head is-center">
              <h2 id="package-keychain-title" className="bubble-title is-section">Keychain Custom Paketmu</h2>
            </div>
            <p className="section-note is-center">
              {contents.keychains}x keychain sudah termasuk {selected?.name}. Upload fotonya di sini, ya.
            </p>
            {packageKeychain}
          </section>
        )}
      </div>

      <div className="split-side">
        <section className="picked-bar" aria-labelledby="picked-title">
          <div className="picked-list">
            {picks.map(pick => (
              <button key={pick.uid} type="button" className="picked-item" onClick={() => remove(pick.uid)} aria-label="Lepas charm ini">
                <PickArt pick={pick} charmsById={charmsById} />
                <span className="remove-dot" aria-hidden="true">×</span>
              </button>
            ))}
            <AddSlotButton onClick={() => catalogRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })} />
          </div>
          <h2 id="picked-title" className="bubble-title is-label">Charm yang kamu pilih</h2>
        </section>

        {!customFirst && customSection}

        <section className="section dashed-box" aria-labelledby="arrange-title">
          <div className="section-head is-center">
            <h2 id="arrange-title" className="bubble-title is-section">Kustomisasi Charm Pilihanmu</h2>
          </div>
          <SlotBoard
            slots={slots}
            tray={useTray ? tray : undefined}
            charmsById={charmsById}
            onChange={onBoardChange}
            groupSize={config.slotCount}
          />
          {useTray && tray.length > 0 && slots.includes(null) && (
            <p className="arrange-auto">
              <button type="button" className="pill" onClick={placeAll}>Pasang otomatis berurutan</button>
            </p>
          )}
          <p className="section-note is-center arrange-note">Kamu bisa drag &amp; drop posisi charm</p>
          <p className="muted hint is-center">
            Atau ketuk dua slot untuk menukar posisinya. {slots.filter(Boolean).length}/{slots.length} slot terisi.
          </p>
        </section>

        <section className="dashed-box note-box">
          <label htmlFor="admin-note" className="bubble-title is-label">Pesan buat Admin</label>
          <textarea
            id="admin-note"
            value={note}
            maxLength={500}
            onChange={e => onNoteChange(e.target.value)}
            placeholder="Misal: tolong charm hati di tengah, ya."
          />
        </section>
        {aside}
      </div>

      {editing && (
        <PhotoCropDialog
          photo={editing.photo}
          onChange={photo => setEditing(prev => (prev ? { ...prev, photo } : prev))}
          onSave={saveEditing}
          onCancel={cancelEditing}
          onReplace={() => fileRef.current?.click()}
        />
      )}
    </div>
  )
}
