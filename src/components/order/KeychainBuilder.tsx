'use client'

import { useId, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { SHAPE_LABEL, isKeychainPhotoReady, withKeychainQty } from '@/lib/order'
import type { KeychainDraft, KeychainShape, KeychainSide, SidePhoto } from '@/lib/order'
import { KEYCHAIN_RING, KEYCHAIN_SHAPES, KEYCHAIN_VIEWBOX, MAX_ZOOM, clampOffset, loadImage, newSidePhoto, photoPlacement } from '@/lib/keychain'
import { validateImage } from '@/lib/uploads'
import { Chevron, Stepper } from './parts'

const SIDE_LABEL: Record<KeychainSide, string> = { front: 'Sisi depan', back: 'Sisi belakang' }

// Ring, shape and photo of one keychain side; `children` is drawn over the photo, under the outline.
function KeychainArt({ shape, photo, clipId, children }: {
  shape: KeychainShape
  photo: SidePhoto | undefined
  clipId: string
  children?: React.ReactNode
}) {
  const { path, box, top } = KEYCHAIN_SHAPES[shape]
  const placement = photo ? photoPlacement(box, photo) : null
  const ringBottom = KEYCHAIN_RING.cy + KEYCHAIN_RING.r
  return (
    <>
      <defs>
        <clipPath id={clipId}>
          <path d={path} />
        </clipPath>
      </defs>
      <circle cx={KEYCHAIN_RING.cx} cy={KEYCHAIN_RING.cy} r={KEYCHAIN_RING.r} fill="none" stroke="var(--cherry)" strokeWidth={9} />
      {top > ringBottom + 4 && (
        <line x1={KEYCHAIN_RING.cx} y1={ringBottom} x2={KEYCHAIN_RING.cx} y2={top} stroke="var(--cherry)" strokeWidth={6} />
      )}
      <path d={path} fill="#FFF8EE" />
      {photo && placement && (
        <image
          href={photo.src}
          x={placement.x}
          y={placement.y}
          width={placement.w}
          height={placement.h}
          preserveAspectRatio="none"
          clipPath={`url(#${clipId})`}
        />
      )}
      {children}
      <path d={path} fill="none" stroke="var(--cherry)" strokeWidth={7} strokeLinejoin="round" />
    </>
  )
}

// `embedded` renders just the designer and quantity, for a keychain that comes with a set.
export function KeychainBuilder({ draft, shapes, onChange, notify, aside, minQty = 1, note, embedded = false }: {
  draft: KeychainDraft
  shapes: KeychainShape[]
  onChange: (draft: KeychainDraft) => void
  notify: (message: string) => void
  aside?: React.ReactNode
  minQty?: number
  note?: React.ReactNode
  embedded?: boolean
}) {
  const [side, setSide] = useState<KeychainSide>('front')
  const [index, setIndex] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const panStart = useRef<{ x: number; y: number; dx: number; dy: number } | null>(null)
  const clipId = `keychain-clip-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`

  const current = Math.min(index, draft.qty - 1)
  const activeSide: KeychainSide = draft.doubleSided ? side : 'front'
  const photo = draft.photos[current]?.[activeSide]
  const shape = KEYCHAIN_SHAPES[draft.shape]
  const zoomFill = photo ? ((photo.zoom - 1) / (MAX_ZOOM - 1)) * 100 : 0

  function setCurrentPhoto(next: SidePhoto) {
    const photos = draft.photos.map((p, i) => (i === current ? { ...p, [activeSide]: next } : p))
    onChange({ ...draft, photos })
  }

  function updatePhoto(patch: Partial<SidePhoto>) {
    if (!photo) return
    const next = { ...photo, ...patch }
    setCurrentPhoto({ ...next, ...clampOffset(shape.box, next, next.dx, next.dy) })
  }

  function setQty(qty: number) {
    const { draft: next, dropped } = withKeychainQty(draft, qty)
    for (const photos of dropped) for (const p of Object.values(photos)) if (p) URL.revokeObjectURL(p.src)
    onChange(next)
    // Show the keychain that was just added so its photo can be uploaded right away.
    if (qty > draft.qty) goToKeychain(qty - 1)
  }

  function goToKeychain(next: number) {
    setIndex(next)
    setSide('front')
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
      const img = await loadImage(src)
      if (photo) URL.revokeObjectURL(photo.src)
      setCurrentPhoto(newSidePhoto(file, src, img))
    } catch {
      URL.revokeObjectURL(src)
      notify('Foto ini tidak bisa dibuka. Coba foto lain, ya.')
    }
  }

  function svgScale() {
    const rect = svgRef.current?.getBoundingClientRect()
    return rect ? KEYCHAIN_VIEWBOX.w / rect.width : 1
  }

  function handlePointerDown(e: ReactPointerEvent<SVGSVGElement>) {
    if (!photo) return
    panStart.current = { x: e.clientX, y: e.clientY, dx: photo.dx, dy: photo.dy }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function handlePointerMove(e: ReactPointerEvent<SVGSVGElement>) {
    const s = panStart.current
    if (!s || !photo) return
    const k = svgScale()
    updatePhoto({ dx: s.dx + (e.clientX - s.x) * k, dy: s.dy + (e.clientY - s.y) * k })
  }

  function setShape(next: KeychainShape) {
    // Re-centre photos so they still cover the new shape.
    const photos = draft.photos.map(sides => Object.fromEntries(
      Object.entries(sides).map(([key, p]) => [key, p && { ...p, dx: 0, dy: 0 }]),
    ) as KeychainDraft['photos'][number])
    onChange({ ...draft, shape: next, photos })
  }

  const { box } = shape
  const many = draft.qty > 1

  const stage = (
    <section className={`${embedded ? '' : 'split-main '}dashed-box keychain-stage`} aria-label="Desain keychain">
      <div className="keychain-tools">
        <label className="zoom-control">
          <span className="bubble-title is-small">Zoom</span>
          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={photo?.zoom ?? 1}
            disabled={!photo}
            onChange={e => updatePhoto({ zoom: Number(e.target.value) })}
            style={{ '--fill': `${zoomFill}%` } as React.CSSProperties}
          />
        </label>
        <div className="side-toggle" role="radiogroup" aria-label="Jumlah sisi">
          <button
            type="button"
            role="radio"
            aria-checked={!draft.doubleSided}
            className={!draft.doubleSided ? 'is-active' : ''}
            onClick={() => { onChange({ ...draft, doubleSided: false }); setSide('front') }}
          >
            <span className="bubble-title is-small">Satu sisi</span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={draft.doubleSided}
            className={draft.doubleSided ? 'is-active' : ''}
            onClick={() => onChange({ ...draft, doubleSided: true })}
          >
            <span className="bubble-title is-small">Bolak Balik</span>
          </button>
        </div>
      </div>

      <div className="keychain-preview">
        {many && (
          <button
            type="button"
            className="arrow-btn"
            onClick={() => goToKeychain(current - 1)}
            disabled={current === 0}
            aria-label="Keychain sebelumnya"
          >
            <Chevron direction="left" />
          </button>
        )}

        <svg
          ref={svgRef}
          className={`keychain-svg ${photo ? 'has-photo' : ''}`}
          viewBox={`0 0 ${KEYCHAIN_VIEWBOX.w} ${KEYCHAIN_VIEWBOX.h}`}
          role="img"
          aria-label={`Preview keychain ${current + 1} ${SHAPE_LABEL[draft.shape]}, ${SIDE_LABEL[activeSide].toLowerCase()}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={() => { panStart.current = null }}
          onPointerCancel={() => { panStart.current = null }}
          onClick={() => { if (!photo) fileRef.current?.click() }}
        >
          <KeychainArt shape={draft.shape} photo={photo} clipId={clipId}>
            {!photo && (
              <g style={{ cursor: 'pointer' }}>
                <circle cx={box.x + box.w / 2} cy={box.y + box.h / 2 - 18} r={26} fill="var(--cherry)" />
                <path
                  d={`M${box.x + box.w / 2 - 11} ${box.y + box.h / 2 - 18} h22 M${box.x + box.w / 2} ${box.y + box.h / 2 - 29} v22`}
                  stroke="var(--cream)"
                  strokeWidth={3}
                  strokeLinecap="round"
                />
                <text x={box.x + box.w / 2} y={box.y + box.h / 2 + 30} textAnchor="middle" fill="var(--cherry)" fontSize={12.5} fontWeight={700}>
                  <tspan x={box.x + box.w / 2}>Upload dan sesuaikan</tspan>
                  <tspan x={box.x + box.w / 2} dy={16}>fotomu disini</tspan>
                </text>
              </g>
            )}
          </KeychainArt>
        </svg>

        {many && (
          <button
            type="button"
            className="arrow-btn"
            onClick={() => goToKeychain(current + 1)}
            disabled={current >= draft.qty - 1}
            aria-label="Keychain berikutnya"
          >
            <Chevron direction="right" />
          </button>
        )}
      </div>

      {many && <p className="side-label">Keychain {current + 1} dari {draft.qty}</p>}
      {draft.doubleSided && (
        <div className="side-switch" role="radiogroup" aria-label="Sisi keychain">
          {(['front', 'back'] as const).map(s => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={activeSide === s}
              className={`pill ${activeSide === s ? 'is-active' : ''}`}
              onClick={() => setSide(s)}
            >
              {SIDE_LABEL[s]}
            </button>
          ))}
        </div>
      )}
      {photo && (
        <p className="muted hint is-center">
          Geser foto untuk mengatur posisi.{' '}
          <button type="button" className="receipt-edit" onClick={() => fileRef.current?.click()}>Ganti foto</button>
        </p>
      )}

      {many && (
        <div className="keychain-thumbs" role="group" aria-label="Semua keychain">
          {draft.photos.map((sides, i) => {
            const ready = isKeychainPhotoReady(sides, draft.doubleSided)
            return (
              <button
                key={i}
                type="button"
                className={`keychain-thumb ${i === current ? 'is-active' : ''} ${ready ? 'is-ready' : ''}`}
                aria-pressed={i === current}
                aria-label={`Keychain ${i + 1}${ready ? ', foto lengkap' : ', foto belum lengkap'}`}
                onClick={() => goToKeychain(i)}
              >
                <svg viewBox={`0 0 ${KEYCHAIN_VIEWBOX.w} ${KEYCHAIN_VIEWBOX.h}`} aria-hidden="true">
                  <KeychainArt shape={draft.shape} photo={sides.front} clipId={`${clipId}-${i}`} />
                </svg>
                <span className="keychain-thumb-label" aria-hidden="true">{ready ? '✓' : i + 1}</span>
              </button>
            )
          })}
        </div>
      )}

      <div className="shape-options" role="radiogroup" aria-label="Bentuk keychain">
        {shapes.map(s => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={draft.shape === s}
            className={`pill ${draft.shape === s ? 'is-active' : ''}`}
            onClick={() => setShape(s)}
          >
            {SHAPE_LABEL[s]}
          </button>
        ))}
      </div>

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

  const qtyRow = (
    <div className="qty-row">
      <h2 className="bubble-title is-section">Jumlah {embedded ? 'Keychain' : 'Pesanan'}</h2>
      <Stepper label="Jumlah keychain" value={draft.qty} min={minQty} max={50} onChange={setQty} />
    </div>
  )

  if (embedded) {
    return (
      <div className="package-keychain">
        {stage}
        {qtyRow}
        {note}
      </div>
    )
  }

  return (
    <div className="split-layout">
      {stage}
      <div className="split-side">
        {qtyRow}
        {note}
        {aside}
      </div>
    </div>
  )
}
