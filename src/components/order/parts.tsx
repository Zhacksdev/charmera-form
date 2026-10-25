/* eslint-disable @next/next/no-img-element -- charm art comes from Supabase, blob: previews and local tiles */
import type { CharmPick, ShopCharm } from '@/lib/order'

export function Chevron({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path
        d={direction === 'left' ? 'M10.5 2.5 5 8l5.5 5.5' : 'M5.5 2.5 11 8l-5.5 5.5'}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function CharmArt({ charm }: { charm: ShopCharm }) {
  if (charm.image) {
    return (
      <span className="charm-art">
        <img src={charm.image} alt={charm.name} loading="lazy" draggable={false} />
      </span>
    )
  }
  return (
    <span className="link-frame">
      <span className="link-window">
        <span className="charm-emoji" aria-label={charm.name}>{charm.emoji}</span>
      </span>
    </span>
  )
}

export function PhotoLink({ src, alt }: { src?: string; alt: string }) {
  return (
    <span className="link-frame">
      <span className="link-window">{src && <img src={src} alt={alt} draggable={false} />}</span>
    </span>
  )
}

export function PickArt({ pick, charmsById }: { pick: CharmPick; charmsById: Map<string, ShopCharm> }) {
  if (pick.kind === 'custom') return <PhotoLink src={pick.preview} alt="Charm custom" />
  const charm = charmsById.get(pick.charmId)
  return charm ? <CharmArt charm={charm} /> : <PhotoLink alt="Charm" />
}

export function pickLabel(pick: CharmPick | null, charmsById: Map<string, ShopCharm>) {
  if (!pick) return 'kosong'
  if (pick.kind === 'custom') return 'charm custom'
  return charmsById.get(pick.charmId)?.name ?? 'charm'
}

export function AddSlotButton({ onClick, label = 'Tambah Slot Charm' }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" className="add-slot" onClick={onClick} aria-label={label}>
      <span className="plus" aria-hidden="true">+</span>
      <span aria-hidden="true">{label}</span>
    </button>
  )
}

export function Stepper({ value, min, max, onChange, label }: {
  value: number
  min: number
  max: number
  onChange: (value: number) => void
  label: string
}) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" onClick={() => onChange(value - 1)} disabled={value <= min} aria-label="Kurangi">−</button>
      <output aria-live="polite">{value}</output>
      <button type="button" onClick={() => onChange(value + 1)} disabled={value >= max} aria-label="Tambah">+</button>
    </div>
  )
}
