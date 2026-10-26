'use client'

import { useEffect, useId, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { SidePhoto } from '@/lib/order'
import { CHARM_WINDOW, MAX_ZOOM, clampOffset, photoPlacement } from '@/lib/keychain'

// Frame a custom charm photo: drag to move, slider to zoom, inside the real charm window shape.
export function PhotoCropDialog({ photo, onChange, onSave, onCancel, onReplace }: {
  photo: SidePhoto
  onChange: (photo: SidePhoto) => void
  onSave: () => Promise<void>
  onCancel: () => void
  onReplace: () => void
}) {
  const [saving, setSaving] = useState(false)
  const svgRef = useRef<SVGSVGElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const panStart = useRef<{ x: number; y: number; dx: number; dy: number } | null>(null)
  const titleId = useId()
  const box = CHARM_WINDOW
  const placement = photoPlacement(box, photo)
  const zoomFill = ((photo.zoom - 1) / (MAX_ZOOM - 1)) * 100

  useEffect(() => {
    dialogRef.current?.focus()
  }, [])

  function update(patch: Partial<SidePhoto>) {
    const next = { ...photo, ...patch }
    onChange({ ...next, ...clampOffset(box, next, next.dx, next.dy) })
  }

  function handlePointerDown(e: ReactPointerEvent<SVGSVGElement>) {
    panStart.current = { x: e.clientX, y: e.clientY, dx: photo.dx, dy: photo.dy }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function handlePointerMove(e: ReactPointerEvent<SVGSVGElement>) {
    const s = panStart.current
    if (!s) return
    const rect = svgRef.current?.getBoundingClientRect()
    const k = rect ? box.w / rect.width : 1
    update({ dx: s.dx + (e.clientX - s.x) * k, dy: s.dy + (e.clientY - s.y) * k })
  }

  async function save() {
    setSaving(true)
    try {
      await onSave()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="crop-backdrop" onClick={e => { if (e.target === e.currentTarget && !saving) onCancel() }}>
      <div
        ref={dialogRef}
        className="crop-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={e => { if (e.key === 'Escape' && !saving) onCancel() }}
      >
        <h2 id={titleId} className="bubble-title is-section">Atur Posisi Foto</h2>

        <span className="link-frame crop-frame">
          <span className="link-window">
            <svg
              ref={svgRef}
              className="crop-svg"
              viewBox={`0 0 ${box.w} ${box.h}`}
              role="img"
              aria-label="Preview charm custom. Geser untuk mengatur posisi foto."
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={() => { panStart.current = null }}
              onPointerCancel={() => { panStart.current = null }}
            >
              <image href={photo.src} x={placement.x} y={placement.y} width={placement.w} height={placement.h} preserveAspectRatio="none" />
            </svg>
          </span>
        </span>
        <p className="muted hint is-center">Geser foto untuk mengatur posisi.</p>

        <label className="zoom-control crop-zoom">
          <span className="bubble-title is-small">Zoom</span>
          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={photo.zoom}
            onChange={e => update({ zoom: Number(e.target.value) })}
            style={{ '--fill': `${zoomFill}%` } as React.CSSProperties}
          />
        </label>

        <div className="crop-actions">
          <button type="button" className="receipt-edit" onClick={onReplace} disabled={saving}>Ganti foto</button>
          <span className="crop-buttons">
            <button type="button" className="pill" onClick={onCancel} disabled={saving}>Batal</button>
            <button type="button" className="btn-primary" onClick={save} disabled={saving}>
              {saving ? 'Menyimpan…' : 'Simpan'}
            </button>
          </span>
        </div>
      </div>
    </div>
  )
}
