'use client'

import { useRef, useState } from 'react'
import Image from 'next/image'
import type { Package } from '@/lib/supabase'
import { formatRupiah, formatShortPrice, newUid } from '@/lib/order'
import type { CharmPick, ShopCharm, ShopConfig } from '@/lib/order'
import { validateImage } from '@/lib/uploads'
import { AddSlotButton, CharmArt, Chevron, PickArt, PhotoLink } from './parts'
import { SlotBoard } from './SlotBoard'

const PAGE_SIZE = 48

export function BraceletBuilder({
  packages, charms, charmsById, config, packageId, onSelectPackage, slots, onSlotsChange, note, onNoteChange, notify, aside,
}: {
  aside?: React.ReactNode
  packages: Package[]
  charms: ShopCharm[]
  charmsById: Map<string, ShopCharm>
  config: ShopConfig
  packageId: string
  onSelectPackage: (id: string) => void
  slots: (CharmPick | null)[]
  onSlotsChange: (slots: (CharmPick | null)[]) => void
  note: string
  onNoteChange: (note: string) => void
  notify: (message: string) => void
}) {
  const [page, setPage] = useState(0)
  const [setsPage, setSetsPage] = useState(0)
  const setsRef = useRef<HTMLDivElement>(null)
  const catalogRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const replaceTarget = useRef<string | null>(null)

  const pageCount = Math.max(1, Math.ceil(charms.length / PAGE_SIZE))
  const visibleCharms = charms.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const setPages = Math.max(1, Math.ceil(packages.length / 3))
  const picks = slots.filter((s): s is CharmPick => s !== null)
  const customPicks = picks.filter(p => p.kind === 'custom')
  const pickCounts = new Map<string, number>()
  for (const p of picks) if (p.kind === 'catalog') pickCounts.set(p.charmId, (pickCounts.get(p.charmId) ?? 0) + 1)

  function place(pick: CharmPick) {
    const index = slots.indexOf(null)
    if (index === -1) {
      notify(`Gelangmu cuma muat ${slots.length} charm. Lepas satu dulu, ya.`)
      return false
    }
    const next = [...slots]
    next[index] = pick
    onSlotsChange(next)
    return true
  }

  function remove(uid: string) {
    const target = slots.find(s => s?.uid === uid)
    if (target?.kind === 'custom') URL.revokeObjectURL(target.preview)
    onSlotsChange(slots.map(s => (s?.uid === uid ? null : s)))
  }

  function openPicker(replaceUid: string | null) {
    replaceTarget.current = replaceUid
    fileRef.current?.click()
  }

  function handleFile(file: File | undefined) {
    if (!file) return
    const problem = validateImage(file)
    if (problem) {
      notify(problem)
      return
    }
    const preview = URL.createObjectURL(file)
    const replaceUid = replaceTarget.current
    if (replaceUid) {
      onSlotsChange(slots.map(s => {
        if (s?.uid !== replaceUid || s.kind !== 'custom') return s
        URL.revokeObjectURL(s.preview)
        return { ...s, file, preview }
      }))
    } else if (!place({ uid: newUid(), kind: 'custom', file, preview })) {
      URL.revokeObjectURL(preview)
    }
  }

  function scrollSets(toPage: number) {
    const el = setsRef.current
    if (el) el.scrollTo({ left: toPage * el.clientWidth, behavior: 'smooth' })
  }

  return (
    <div className="split-layout">
      <div className="split-main">
        <section aria-label="Pilih set">
          <div
            ref={setsRef}
            className="sets"
            onScroll={e => setSetsPage(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
          >
            {packages.map(pkg => (
              <button
                key={pkg.id}
                type="button"
                className={`set-card ${packageId === pkg.id ? 'is-active' : ''}`}
                aria-pressed={packageId === pkg.id}
                onClick={() => onSelectPackage(pkg.id)}
              >
                <h2 className="bubble-title is-small">{pkg.name}</h2>
                <span className="set-items">
                  {(pkg.items?.length ? pkg.items : [pkg.description || '1x Plain Bracelet']).map(item => (
                    <span key={item}><span className="chip">{item}</span></span>
                  ))}
                </span>
                <span className="set-price">{formatRupiah(pkg.price)}</span>
                <Image className="set-mascot" src="/assets/maskot-set.webp" alt="" width={158} height={93} />
              </button>
            ))}
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
        </section>

        <section className="section" ref={catalogRef} aria-labelledby="catalog-title">
          <div className="section-head">
            <button type="button" className="arrow-btn" onClick={() => setPage(p => p - 1)} disabled={page === 0} aria-label="Charm sebelumnya">
              <Chevron direction="left" />
            </button>
            <h2 id="catalog-title" className="bubble-title is-section">Pilih Charm Favoritmu</h2>
            <button type="button" className="arrow-btn" onClick={() => setPage(p => p + 1)} disabled={page >= pageCount - 1} aria-label="Charm berikutnya">
              <Chevron direction="right" />
            </button>
          </div>
          <p className="section-note is-center">Harga tiap charm {formatShortPrice(config.charmPrice)}</p>
          <div className="charm-grid">
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
        </section>
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

        <section className="section" aria-labelledby="custom-title">
          <div className="custom-row">
            <div>
              <h2 id="custom-title" className="bubble-title is-section">Custom Charm</h2>
              <p className="section-note">Harga tiap charm {formatShortPrice(config.customCharmPrice)}</p>
            </div>
            <div className="custom-list">
              {customPicks.map(pick => (
                <span key={pick.uid} className="picked-item">
                  <button type="button" className="custom-photo-btn" onClick={() => openPicker(pick.uid)} aria-label="Ganti foto charm custom">
                    <PhotoLink src={pick.kind === 'custom' ? pick.preview : undefined} alt="Charm custom" />
                  </button>
                  <button type="button" className="remove-dot" onClick={() => remove(pick.uid)} aria-label="Hapus charm custom">×</button>
                </span>
              ))}
              <AddSlotButton onClick={() => openPicker(null)} label="Upload Foto Charm" />
            </div>
          </div>
          <p className="muted hint">Foto akan dipotong mengikuti bentuk charm. Pilih foto yang wajahnya di tengah.</p>
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

        <section className="section dashed-box" aria-labelledby="arrange-title">
          <div className="section-head is-center">
            <h2 id="arrange-title" className="bubble-title is-section">Kustomisasi Charm Pilihanmu</h2>
          </div>
          <SlotBoard slots={slots} charmsById={charmsById} onChange={onSlotsChange} />
          <p className="section-note is-center arrange-note">Kamu bisa drag &amp; drop posisi charm</p>
          <p className="muted hint is-center">
            Atau ketuk dua slot untuk menukar posisinya. {picks.length}/{slots.length} slot terisi.
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
    </div>
  )
}
