'use client'

import { useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { CharmPick, ShopCharm } from '@/lib/order'
import { PhotoLink, PickArt, pickLabel } from './parts'

interface DragState {
  from: number
  x: number
  y: number
  over: number | null
}

const DRAG_THRESHOLD = 6

// Drag with a pointer (works for touch and mouse), or tap one slot then another to swap.
// With several bracelets the board shows one row per bracelet of `groupSize` slots, and `tray` holds charms
// that are picked but not placed yet. Bracelet slots and tray cells share one index space
// (slots first, then the tray, then one empty cell to drop a charm back), so the same swap moves
// charms between bracelets and in or out of the tray.
export function SlotBoard({ slots, tray, charmsById, onChange, groupSize = slots.length }: {
  slots: (CharmPick | null)[]
  tray?: CharmPick[]
  charmsById: Map<string, ShopCharm>
  onChange: (slots: (CharmPick | null)[], tray: CharmPick[]) => void
  groupSize?: number
}) {
  const [selected, setSelected] = useState<number | null>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const start = useRef<{ from: number; x: number; y: number } | null>(null)
  const justDragged = useRef(false)

  const cells: (CharmPick | null)[] = tray ? [...slots, ...tray, null] : slots

  function swap(a: number, b: number) {
    const next = [...cells]
    ;[next[a], next[b]] = [next[b], next[a]]
    onChange(next.slice(0, slots.length), next.slice(slots.length).filter((c): c is CharmPick => c !== null))
  }

  function slotAt(x: number, y: number) {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-slot]')
    return el ? Number(el.dataset.slot) : null
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLButtonElement>, index: number) {
    if (!cells[index] || e.button !== 0) return
    start.current = { from: index, x: e.clientX, y: e.clientY }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLButtonElement>) {
    const s = start.current
    if (!s) return
    if (!drag && Math.hypot(e.clientX - s.x, e.clientY - s.y) < DRAG_THRESHOLD) return
    setDrag({ from: s.from, x: e.clientX, y: e.clientY, over: slotAt(e.clientX, e.clientY) })
  }

  function handlePointerUp() {
    start.current = null
    if (!drag) return
    if (drag.over !== null && drag.over !== drag.from) swap(drag.from, drag.over)
    justDragged.current = true
    setDrag(null)
    setSelected(null)
  }

  function handleClick(index: number) {
    if (justDragged.current) {
      justDragged.current = false
      return
    }
    if (selected === null) {
      if (cells[index]) setSelected(index)
    } else if (selected === index) {
      setSelected(null)
    } else {
      swap(selected, index)
      setSelected(null)
    }
  }

  function cell(i: number, label: string) {
    const pick = cells[i]
    return (
      <button
        key={i}
        type="button"
        data-slot={i}
        className={[
          'slot',
          selected === i && 'is-selected',
          drag?.over === i && drag.from !== i && 'is-target',
          drag?.from === i && 'is-dragging',
        ].filter(Boolean).join(' ')}
        aria-label={`${label}: ${pickLabel(pick, charmsById)}`}
        aria-pressed={selected === i}
        onPointerDown={e => handlePointerDown(e, i)}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => { start.current = null; setDrag(null) }}
        onClick={() => handleClick(i)}
      >
        {pick ? <PickArt pick={pick} charmsById={charmsById} /> : <PhotoLink alt="" />}
      </button>
    )
  }

  const dragged = drag ? cells[drag.from] : null
  const size = Math.max(1, groupSize)
  const groupStarts = Array.from({ length: Math.ceil(slots.length / size) }, (_, g) => g * size)
  const grouped = groupStarts.length > 1
  // Without a tray, charms fill the bracelets in order; mark the one being filled.
  const current = tray ? -1 : groupStarts.findIndex(first => slots.slice(first, first + size).includes(null))

  return (
    <>
      {tray && (
        <div className="slot-tray">
          <p className="slot-group-title">
            Charm belum dipasang
            <span>{tray.length ? `${tray.length} charm` : 'semua sudah terpasang'}</span>
          </p>
          <div className="slot-tray-list">
            {cells.slice(slots.length).map((_, offset) => cell(slots.length + offset, offset < tray.length ? 'Charm belum dipasang' : 'Kembalikan ke daftar'))}
          </div>
          {tray.length > 0 && <p className="muted">Ketuk charm di sini, lalu ketuk slot gelang tujuannya (atau geser langsung).</p>}
        </div>
      )}
      {groupStarts.map((first, g) => {
        const group = slots.slice(first, first + size)
        return (
          <div key={first} className={grouped ? `slot-group ${g === current ? 'is-current' : ''}` : undefined}>
            {grouped && (
              <p className="slot-group-title">
                Gelang {g + 1}
                <span>{group.filter(Boolean).length}/{group.length}{g === current ? ' · sedang diisi' : ''}</span>
              </p>
            )}
            <div className="slot-grid" style={{ '--slot-cols': Math.min(size, 9) } as React.CSSProperties}>
              {group.map((_, offset) => cell(first + offset, `${grouped ? `Gelang ${g + 1}, posisi` : 'Posisi'} ${offset + 1}`))}
            </div>
          </div>
        )
      })}
      {drag && dragged && (
        <div className="drag-ghost" style={{ left: drag.x, top: drag.y }} aria-hidden="true">
          <PickArt pick={dragged} charmsById={charmsById} />
        </div>
      )}
    </>
  )
}
