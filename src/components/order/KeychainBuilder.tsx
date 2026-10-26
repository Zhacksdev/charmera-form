'use client'

import { useId, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { SHAPE_LABEL } from '@/lib/order'
import type { KeychainDraft, KeychainShape, KeychainSide, SidePhoto } from '@/lib/order'
import { KEYCHAIN_RING, KEYCHAIN_SHAPES, KEYCHAIN_VIEWBOX, MAX_ZOOM, clampOffset, loadImage, newSidePhoto, photoPlacement } from '@/lib/keychain'
import { validateImage } from '@/lib/uploads'
import { Chevron, Stepper } from './parts'

const SIDE_LABEL: Record<KeychainSide, string> = { front: 'Sisi depan', back: 'Sisi belakang' }

export function KeychainBuilder({ draft, shapes, onChange, notify, aside }: {
  draft: KeychainDraft
  shapes: KeychainShape[]
  onChange: (draft: KeychainDraft) => void
  notify: (message: string) => void
  aside?: React.ReactNode
}) {
  const [side, setSide] = useState<KeychainSide>('front')
  const fileRef = useRef<HTMLInputElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const panStart = useRef<{ x: number; y: number; dx: number; dy: number } | null>(null)
  const clipId = `keychain-clip-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`

  const activeSide: KeychainSide = draft.doubleSided ? side : 'front'
  const photo = draft.photos[activeSide]
  const shape = KEYCHAIN_SHAPES[draft.shape]
  const zoomFill = photo ? ((photo.zoom - 1) / (MAX_ZOOM - 1)) * 100 : 0

  function updatePhoto(patch: Partial<SidePhoto>) {
    if (!photo) return
    const next = { ...photo, ...patch }
    const clamped = clampOffset(shape.box, next, next.dx, next.dy)
    onChange({ ...draft, photos: { ...draft.photos, [activeSide]: { ...next, ...clamped } } })
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
      onChange({ ...draft, photos: { ...draft.photos, [activeSide]: newSidePhoto(file, src, img) } })
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
    const photos = Object.fromEntries(
      Object.entries(draft.photos).map(([key, p]) => [key, p && { ...p, dx: 0, dy: 0 }]),
    ) as KeychainDraft['photos']
    onChange({ ...draft, shape: next, photos })
  }

  const placement = photo ? photoPlacement(shape.box, photo) : null
  const ringBottom = KEYCHAIN_RING.cy + KEYCHAIN_RING.r
  const { box } = shape

  return (
    <div className="split-layout">
      <section className="split-main dashed-box keychain-stage" aria-label="Desain keychain">
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
          <button
            type="button"
            className="arrow-btn"
            onClick={() => setSide('front')}
            disabled={!draft.doubleSided || activeSide === 'front'}
            aria-label="Sisi depan"
          >
            <Chevron direction="left" />
          </button>

          <svg
            ref={svgRef}
            className={`keychain-svg ${photo ? 'has-photo' : ''}`}
            viewBox={`0 0 ${KEYCHAIN_VIEWBOX.w} ${KEYCHAIN_VIEWBOX.h}`}
            role="img"
            aria-label={`Preview keychain ${SHAPE_LABEL[draft.shape]}, ${SIDE_LABEL[activeSide].toLowerCase()}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={() => { panStart.current = null }}
            onPointerCancel={() => { panStart.current = null }}
            onClick={() => { if (!photo) fileRef.current?.click() }}
          >
            <defs>
              <clipPath id={clipId}>
                <path d={shape.path} />
              </clipPath>
            </defs>
            <circle cx={KEYCHAIN_RING.cx} cy={KEYCHAIN_RING.cy} r={KEYCHAIN_RING.r} fill="none" stroke="var(--cherry)" strokeWidth={9} />
            {shape.top > ringBottom + 4 && (
              <line x1={KEYCHAIN_RING.cx} y1={ringBottom} x2={KEYCHAIN_RING.cx} y2={shape.top} stroke="var(--cherry)" strokeWidth={6} />
            )}
            <path d={shape.path} fill="#FFF8EE" />
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
            <path d={shape.path} fill="none" stroke="var(--cherry)" strokeWidth={7} strokeLinejoin="round" />
          </svg>

          <button
            type="button"
            className="arrow-btn"
            onClick={() => setSide('back')}
            disabled={!draft.doubleSided || activeSide === 'back'}
            aria-label="Sisi belakang"
          >
            <Chevron direction="right" />
          </button>
        </div>

        {draft.doubleSided && <p className="side-label">{SIDE_LABEL[activeSide]}</p>}
        {photo && (
          <p className="muted hint is-center">
            Geser foto untuk mengatur posisi.{' '}
            <button type="button" className="receipt-edit" onClick={() => fileRef.current?.click()}>Ganti foto</button>
          </p>
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

      <div className="split-side">
        <div className="qty-row">
          <h2 className="bubble-title is-section">Jumlah Pesanan</h2>
          <Stepper label="Jumlah keychain" value={draft.qty} min={1} max={50} onChange={qty => onChange({ ...draft, qty })} />
        </div>
        {aside}
      </div>
    </div>
  )
}
