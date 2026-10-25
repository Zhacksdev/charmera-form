'use client'

import { useState } from 'react'
import Image from 'next/image'

const CHARM_COLORS = ['#E8458B', '#F2A81D', '#4CB88F', '#7B6CF0', '#F2762E', '#4AA8E8', '#C94FD0', '#2FB5B5', '#D6455D', '#5B8DEF']
const CHARM_EMOJIS = ['♥', '★', '✿', '☾', '☀', '❄', '♪', '☺', '❦', '➶']

export default function DemoPage() {
  const [tab, setTab] = useState<'charm' | 'ganci' | 'checkout'>('charm')
  const [selectedPackage, setSelectedPackage] = useState<string>('pkg1')
  const [pickedCharms, setPickedCharms] = useState<Set<number>>(new Set())
  const [activeCharm, setActiveCharm] = useState<number | null>(null)
  const [slots, setSlots] = useState<(number | null)[]>(Array(9).fill(null))
  const [slotCount, setSlotCount] = useState(9)
  const [gap, setGap] = useState<'gap' | 'tight'>('gap')
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [photoShape, setPhotoShape] = useState<'heart' | 'circle' | 'square'>('heart')
  const [photoZoom, setPhotoZoom] = useState(1)
  const [ganciQty, setGanciQty] = useState(1)
  const [cart, setCart] = useState([])
  const [name, setName] = useState('')
  const [wa, setWa] = useState('')
  const [addr, setAddr] = useState('')

  const packages = [
    { id: 'pkg1', name: 'Bracelet', price: 35000 },
    { id: 'pkg2', name: 'Keychain', price: 30000 },
    { id: 'pkg3', name: 'Combo', price: 60000 }
  ]

  const charms = CHARM_EMOJIS.map((e, i) => ({
    id: `c${i}`,
    emoji: e,
    name: `Charm ${i + 1}`,
    price: 10000 + (i % 3) * 5000
  }))

  function toggleCharm(i: number) {
    setPickedCharms(prev => {
      const next = new Set(prev)
      if (next.has(i)) {
        next.delete(i)
        setSlots(s => s.map(x => x === i ? null : x))
        if (activeCharm === i) setActiveCharm(null)
      } else {
        next.add(i)
        setActiveCharm(i)
      }
      return next
    })
  }

  function handleSlotClick(i: number) {
    if (activeCharm !== null) {
      setSlots(prev => {
        const next = [...prev]
        if (next[i] === activeCharm) {
          next[i] = null
        } else {
          next[i] = activeCharm
        }
        return next
      })
    }
  }

  function updateSlotCount(newCount: number) {
    setSlotCount(newCount)
    setSlots(Array(newCount).fill(null))
  }

  const selectedPkg = packages.find(p => p.id === selectedPackage)
  const braceletTotal = (selectedPkg?.price || 0) + slots.reduce((s: number, x: number | null) => {
    if (x !== null && x >= 0 && x < charms.length) {
      return s + (charms[x]?.price || 0)
    }
    return s
  }, 0)
  const ganciTotal = photoPreview ? 35000 * ganciQty : 0
  const cartTotal = cart.reduce((s: number) => s, 0)

  return (
    <>
      <style jsx global>{`
        :root {
          --cherry: #D62839;
          --cream: #FFF4E3;
          --rose: #F2B8C0;
          --char: #26211F;
          --butter: #F6D98B;
          --sky: #A9C9E8;
          --bg: #FFF4E3;
          --fg: #26211F;
          --card: #FFFFFF;
          --line: #E9D9C0;
          --text-light: #D62839;
        }
      `}</style>
      <div style={{ background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'Nunito, system-ui, sans-serif', minHeight: '100vh' }}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px clamp(16px, 4vw, 40px)', background: 'var(--cherry)', color: 'var(--cream)' }}>
          <div style={{ fontFamily: 'Fraunces, Georgia, serif', fontWeight: 800, fontSize: 24, fontStyle: 'italic' }}>Chamera</div>
          <button onClick={() => setTab('checkout')} style={{ background: 'var(--cream)', color: 'var(--cherry)', border: 0, borderRadius: 99, padding: '8px 16px', fontWeight: 700, cursor: 'pointer' }}>
            Cart ({cart.length})
          </button>
        </header>

        <div style={{ padding: '8px clamp(16px, 4vw, 40px) 20px', maxWidth: 1100, margin: 'auto' }}>
          <h1 style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 'clamp(34px, 7vw, 64px)', lineHeight: 1, margin: '0 0 10px', fontWeight: 700, color: 'var(--cherry)', fontStyle: 'italic' }}>
            Momen kamu, jadi charm kamu.
          </h1>
          <p style={{ margin: 0, color: 'var(--text-light)', maxWidth: '52ch', fontSize: 16 }}>
            Pilih charm atau upload fotomu. Preview langsung jadi, kodenya terisi sendiri.
          </p>
        </div>

        <nav style={{ display: 'flex', gap: 8, maxWidth: 1100, margin: '12px auto 0', padding: '0 clamp(16px, 4vw, 40px)', flexWrap: 'wrap' }}>
          {(['charm', 'ganci', 'checkout'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ border: '2px solid var(--line)', background: tab === t ? 'var(--cherry)' : 'var(--card)', color: tab === t ? 'var(--cream)' : 'var(--fg)', borderRadius: 99, padding: '10px 18px', fontWeight: 700, cursor: 'pointer', borderColor: tab === t ? 'var(--cherry)' : 'var(--line)' }}>
              {t === 'charm' ? 'Italian charm' : t === 'ganci' ? 'Ganci foto' : 'Checkout'}
            </button>
          ))}
        </nav>

        <main style={{ maxWidth: 1100, margin: 'auto', padding: '20px clamp(16px, 4vw, 40px) 60px' }}>
          {tab === 'charm' && (
            <>
              <h2 style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 22, margin: '0 0 12px', fontStyle: 'italic', color: 'var(--cherry)' }}>Pilih paket dulu</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12, marginBottom: 20 }}>
                {packages.map(pkg => (
                  <button key={pkg.id} onClick={() => setSelectedPackage(pkg.id)} style={{ textAlign: 'left', border: '2px solid var(--line)', background: 'var(--card)', color: 'var(--fg)', borderRadius: 20, padding: 18, cursor: 'pointer', boxShadow: selectedPackage === pkg.id ? '5px 5px 0 var(--cherry)' : 'none', borderColor: selectedPackage === pkg.id ? 'var(--cherry)' : 'var(--line)' }}>
                    <b style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 20, fontStyle: 'italic' }}>{pkg.name}</b>
                    <span style={{ display: 'block', color: 'var(--text-light)', fontSize: 14, marginTop: 8 }}>Rp {pkg.price.toLocaleString('id')}</span>
                  </button>
                ))}
              </div>

              {selectedPackage && (
                <>
                  <div style={{ background: 'var(--card)', borderRadius: 20, padding: 22, border: '1px solid var(--line)', marginBottom: 20 }}>
                    <h2 style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 22, margin: '0 0 12px', fontStyle: 'italic', color: 'var(--cherry)' }}>Pilih charm</h2>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))', gap: 10 }}>
                      {charms.map((c, i) => (
                        <button key={c.id} onClick={() => toggleCharm(i)} style={{ border: '2px solid var(--line)', background: pickedCharms.has(i) ? 'var(--card)' : 'var(--bg)', borderRadius: 18, padding: '10px 6px', textAlign: 'center', cursor: 'pointer', position: 'relative', borderColor: pickedCharms.has(i) ? 'var(--cherry)' : 'var(--line)', boxShadow: pickedCharms.has(i) ? '0 0 0 2px var(--cherry)' : 'none' }}>
                          <span style={{ display: 'grid', placeItems: 'center', width: 40, height: 40, borderRadius: 10, margin: '0 auto', background: CHARM_COLORS[i % CHARM_COLORS.length], color: '#fff', fontSize: 22, textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>{c.emoji}</span>
                          <b style={{ display: 'block', marginTop: 4, fontSize: 13, color: 'var(--fg)' }}>{c.name}</b>
                          {pickedCharms.has(i) && <span style={{ position: 'absolute', top: 4, right: 6, color: 'var(--cherry)', fontWeight: 700 }}>✓</span>}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div style={{ background: 'var(--card)', borderRadius: 20, padding: 22, border: '1px solid var(--line)', marginBottom: 20 }}>
                    <h2 style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 22, margin: '0 0 12px', fontStyle: 'italic', color: 'var(--cherry)' }}>Atur gelang</h2>
                    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontSize: 13, color: 'var(--text-light)', marginBottom: 8 }}>Jumlah slot</div>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 14, border: '2px solid var(--line)', borderRadius: 99, padding: 4 }}>
                          <button onClick={() => updateSlotCount(Math.max(1, slotCount - 1))} style={{ width: 36, height: 36, borderRadius: '50%', border: 0, background: 'var(--bg)', cursor: 'pointer', fontSize: 20, color: 'var(--cherry)' }}>−</button>
                          <b style={{ minWidth: 28, textAlign: 'center', color: 'var(--cherry)' }}>{slotCount}</b>
                          <button onClick={() => updateSlotCount(Math.min(30, slotCount + 1))} style={{ width: 36, height: 36, borderRadius: '50%', border: 0, background: 'var(--bg)', cursor: 'pointer', fontSize: 20, color: 'var(--cherry)' }}>+</button>
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 13, color: 'var(--text-light)', marginBottom: 8 }}>Jarak antar charm</div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => setGap('gap')} style={{ border: '2px solid var(--line)', borderRadius: 99, padding: '6px 14px', fontWeight: 500, cursor: 'pointer', background: gap === 'gap' ? 'var(--cherry)' : 'var(--card)', color: gap === 'gap' ? 'var(--cream)' : 'var(--fg)' }}>Berjarak</button>
                          <button onClick={() => setGap('tight')} style={{ border: '2px solid var(--line)', borderRadius: 99, padding: '6px 14px', fontWeight: 500, cursor: 'pointer', background: gap === 'tight' ? 'var(--cherry)' : 'var(--card)', color: gap === 'tight' ? 'var(--cream)' : 'var(--fg)' }}>Berhimpitan</button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 1fr', gap: 20 }}>
                    <div style={{ background: 'var(--card)', borderRadius: 20, padding: 22, border: '1px solid var(--line)' }}>
                      <h2 style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 22, margin: '0 0 10px', fontStyle: 'italic', color: 'var(--cherry)' }}>Susun charm</h2>
                      <div style={{ background: 'linear-gradient(160deg, var(--rose), var(--butter))', borderRadius: 24, padding: '26px 14px', minHeight: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, border: '2px solid var(--cherry)', boxShadow: '5px 5px 0 var(--cherry)' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: gap === 'gap' ? 3 : 0, padding: gap === 'gap' ? '8px' : '8px 6px', borderRadius: 14 }}>
                          {slots.map((s, i) => (
                            <button key={i} onClick={() => handleSlotClick(i)} style={{ width: 46, height: 46, borderRadius: gap === 'tight' ? 4 : 10, border: s !== null ? '2px solid rgba(0,0,0,0.18)' : '2px dashed #999', background: s !== null ? CHARM_COLORS[s % CHARM_COLORS.length] : 'rgba(255,255,255,0.6)', display: 'grid', placeItems: 'center', fontSize: 24, padding: 0, cursor: 'pointer', color: s !== null ? '#fff' : 'var(--fg)', textShadow: s !== null ? '0 1px 2px rgba(0,0,0,0.3)' : 'none' }}>
                              {s !== null ? charms[s]?.emoji : i + 1}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 16, minHeight: 52, alignItems: 'center' }}>
                        {pickedCharms.size > 0 ? [...pickedCharms].map(i => (
                          <button key={i} onClick={() => setActiveCharm(activeCharm === i ? null : i)} style={{ width: 48, height: 48, borderRadius: 12, border: '2px solid rgba(0,0,0,0.15)', background: CHARM_COLORS[i % CHARM_COLORS.length], color: '#fff', fontSize: 24, cursor: 'grab', outline: activeCharm === i ? '3px solid var(--cherry)' : 'none', outlineOffset: 2 }}>
                            {charms[i]?.emoji}
                          </button>
                        )) : (
                          <span style={{ fontSize: 13, color: 'var(--text-light)' }}>Pilih charm di langkah 1 dulu.</span>
                        )}
                      </div>
                    </div>

                    <div style={{ background: 'var(--card)', borderRadius: 20, padding: 22, border: '1px solid var(--line)' }}>
                      <h2 style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 22, margin: '0 0 12px', fontStyle: 'italic', color: 'var(--cherry)' }}>Pesananmu</h2>
                      <div style={{ fontSize: 14, color: 'var(--text-light)', marginBottom: 16 }}>
                        <b>{selectedPkg?.name}</b><br/>Rp {braceletTotal.toLocaleString('id')}
                      </div>
                      <button onClick={() => alert('Added to cart!')} style={{ width: '100%', border: 0, borderRadius: 99, background: 'var(--cherry)', color: 'var(--cream)', padding: '13px 22px', fontWeight: 700, cursor: 'pointer' }}>
                        Tambah ke keranjang
                      </button>
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {tab === 'ganci' && (
            <div style={{ textAlign: 'center', color: 'var(--text-light)', fontSize: 16 }}>
              <p>Ganci Foto Demo Page</p>
              <p>Upload foto dan customize shape (heart/circle/square)</p>
            </div>
          )}

          {tab === 'checkout' && (
            <div style={{ textAlign: 'center', color: 'var(--text-light)', fontSize: 16 }}>
              <p>Checkout Demo Page</p>
              <p>Masukkan data pengiriman dan review pesanan</p>
            </div>
          )}
        </main>

        <footer style={{ textAlign: 'center', padding: '30px 20px 50px', fontFamily: 'Fraunces, Georgia, serif', fontStyle: 'italic', color: 'var(--text-light)', borderTop: '1.5px dashed var(--line)', maxWidth: 1100, margin: '0 auto' }}>
          Snap it. Charm it. Keep it.<br />#WearYourChamera
        </footer>
      </div>
    </>
  )
}
