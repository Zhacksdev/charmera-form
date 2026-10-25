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
export function SlotBoard({ slots, charmsById, onChange }: {
  slots: (CharmPick | null)[]
  charmsById: Map<string, ShopCharm>
  onChange: (slots: (CharmPick | null)[]) => void
}) {
  const [selected, setSelected] = useState<number | null>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const start = useRef<{ from: number; x: number; y: number } | null>(null)
  const justDragged = useRef(false)

  function swap(a: number, b: number) {
    const next = [...slots]
    ;[next[a], next[b]] = [next[b], next[a]]
    onChange(next)
  }

  function slotAt(x: number, y: number) {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-slot]')
    return el ? Number(el.dataset.slot) : null
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLButtonElement>, index: number) {
    if (!slots[index] || e.button !== 0) return
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
      if (slots[index]) setSelected(index)
    } else if (selected === index) {
      setSelected(null)
    } else {
      swap(selected, index)
      setSelected(null)
    }
  }

  const dragged = drag ? slots[drag.from] : null

  return (
    <>
      <div className="slot-grid" style={{ '--slot-cols': Math.min(slots.length, 9) } as React.CSSProperties}>
        {slots.map((pick, i) => (
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
            aria-label={`Posisi ${i + 1}: ${pickLabel(pick, charmsById)}`}
            aria-pressed={selected === i}
            onPointerDown={e => handlePointerDown(e, i)}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={() => { start.current = null; setDrag(null) }}
            onClick={() => handleClick(i)}
          >
            {pick ? <PickArt pick={pick} charmsById={charmsById} /> : <PhotoLink alt="" />}
          </button>
        ))}
      </div>
      {drag && dragged && (
        <div className="drag-ghost" style={{ left: drag.x, top: drag.y }} aria-hidden="true">
          <PickArt pick={dragged} charmsById={charmsById} />
        </div>
      )}
    </>
  )
}
