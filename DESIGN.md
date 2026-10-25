# DESIGN.md: Chamera Brand Guide

Sumber: *Chamera Brand Guide* (HTML). File ini adalah versi yang bisa dibaca agen. Pakai sebagai acuan untuk **semua UI** (kiosk, dashboard admin, halaman download), **teks bawaan**, dan **desain frame**.

> Catatan dari guide asli: arah visual adalah asumsi awal. Bila ingin versi modern-clean, palet dan tipografi bisa disesuaikan.
>
> Catatan scope: brief brand menyebut hasil berupa charm bracelet dan gantungan kunci. PRD v1 hanya mencakup strip 4R, GIF, dan live photo. Produksi charm fisik tidak dicakup sistem.

## 1. Brief brand

Chamera adalah photobooth yang hasilnya bukan sekadar cetakan foto, tapi charm bracelet dan gantungan kunci berisi foto kamu sendiri. Nama berasal dari *charm* + *camera*.

| Aspek | Isi |
|---|---|
| Arah visual | Retro-nostalgic meets modern cute: nuansa photobooth jadul dipadukan kesan perhiasan yang manis |
| Target | Anak muda 17-27 tahun yang suka tampil beda, aktif di Instagram dan TikTok. Datang sendiri, bareng bestie, atau berdua sebagai couple |
| Kepribadian | Teman yang playful, hangat, dan sedikit sentimental. Nostalgic, personal, tactile |
| Janji brand | Momen kecil tidak berhenti di galeri HP. Ia dipakai, dibawa, dan dilihat tiap hari |

## 2. Palet warna

| Nama | HEX | RGB | Peran |
|---|---|---|---|
| Cherry Flash | `#D62839` | 214, 40, 57 | Warna utama |
| Film Cream | `#FFF4E3` | 255, 244, 227 | Latar |
| Dusty Rose | `#F2B8C0` | 242, 184, 192 | Pendukung |
| Charcoal | `#26211F` | 38, 33, 31 | Teks dan garis |
| Butter Flash | `#F6D98B` | 246, 217, 139 | Aksen kecil |
| Sky Memory | `#A9C9E8` | 169, 201, 232 | Edisi spesial |

Turunan yang dipakai di guide: garis/border `#E9D9C0`, bayangan kotak kemasan `#A81E2D`, logam di mockup `#9A8F86`.

**Proporsi pakai:** Cream 50% · Cherry 25% · Charcoal 10% · Rose 10% · Butter dan Sky 5%.

**Aturan:** teks di atas Cherry selalu Cream.

### Token (CSS variables)

```css
:root {
  --cherry: #D62839;
  --cream:  #FFF4E3;
  --rose:   #F2B8C0;
  --char:   #26211F;
  --butter: #F6D98B;
  --sky:    #A9C9E8;

  /* tema terang (default) */
  --bg:   #FFF4E3;
  --fg:   #26211F;
  --card: #FFFFFF;
  --line: #E9D9C0;
}

/* tema gelap (opsional, mis. dashboard admin) */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #1E1A18; --fg: #FFF4E3; --card: #2A2523; --line: #403834;
  }
}
:root[data-theme="dark"] {
  --bg: #1E1A18; --fg: #FFF4E3; --card: #2A2523; --line: #403834;
}
```

### Tailwind (extend)

```ts
// tailwind.config.ts, theme.extend (bila Tailwind v4, pindahkan ke @theme)
colors: {
  cherry: '#D62839', cream: '#FFF4E3', rose: '#F2B8C0',
  char: '#26211F', butter: '#F6D98B', sky: '#A9C9E8', line: '#E9D9C0',
},
fontFamily: {
  display: ['Fraunces', 'Georgia', 'serif'],
  sans: ['Nunito', 'system-ui', 'sans-serif'],
},
```

## 3. Logo

Charm dengan jump ring di atas, lensa kamera di badannya, titik flash di sudut, dan hati kecil sebagai pusat lensa. Terbaca sebagai perhiasan sekaligus kamera.

| Varian | Latar | Warna ikon / wordmark (`--a`) | Warna detail (`--b`) |
|---|---|---|---|
| Utama | Cream `#FFF4E3` | Cherry `#D62839` | Cream `#FFF4E3` |
| Terbalik | Cherry `#D62839` | Cream `#FFF4E3` | Cherry `#D62839` |
| Di atas Charcoal | Charcoal `#26211F` | Rose `#F2B8C0` | Charcoal `#26211F` |
| Ikon saja | Rose `#F2B8C0` | Cherry `#D62839` | Rose `#F2B8C0` |

Ikon saja dipakai untuk avatar, stempel, dan bagian belakang charm.

**Aturan pakai**

- Beri ruang kosong di sekeliling logo sebesar tinggi lingkaran lensa.
- Lebar minimum 90 px (layar) atau 25 mm (cetak). Di bawah itu pakai ikon saja.
- Jangan memutar, meregangkan, atau memberi bayangan pada logo.

### Sumber SVG

Warna diatur lewat CSS variable `--a` dan `--b` pada elemen `<svg>` yang memakai `<use>`.

```html
<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <defs>
    <symbol id="icon" viewBox="0 0 100 124">
      <circle cx="50" cy="15" r="11" fill="none" stroke="var(--a)" stroke-width="5"/>
      <circle cx="50" cy="76" r="44" fill="var(--a)"/>
      <circle cx="50" cy="76" r="29" fill="none" stroke="var(--b)" stroke-width="4"/>
      <path d="M50 90 C38 80 36 70 43 66 C47 64 50 67 50 70 C50 67 53 64 57 66 C64 70 62 80 50 90Z" fill="var(--b)"/>
      <circle cx="80" cy="46" r="4.5" fill="var(--b)"/>
    </symbol>
    <symbol id="word" viewBox="0 0 330 80">
      <text x="0" y="62" font-family="Fraunces,Georgia,serif" font-style="italic"
            font-weight="700" font-size="76" fill="var(--a)" letter-spacing="-1">chamera</text>
    </symbol>
  </defs>
</svg>

<!-- Logo utama di atas Cream -->
<svg viewBox="0 0 440 130" role="img" aria-label="Logo Chamera" style="--a:#D62839;--b:#FFF4E3">
  <use href="#icon" y="2" width="102" height="126"/>
  <use href="#word" x="108" y="26" width="330" height="80"/>
</svg>

<!-- Ikon saja -->
<svg viewBox="0 0 100 124" style="--a:#D62839;--b:#F2B8C0">
  <use href="#icon" width="100" height="124"/>
</svg>
```

Untuk kiosk, jadikan komponen React (`<Logo variant="primary|inverted|charcoal|icon" />`) dan **jangan mengandalkan font eksternal** untuk wordmark. Ubah teks wordmark menjadi path (outline) atau pastikan Fraunces Bold Italic sudah di-self-host.

## 4. Tipografi

| Peran | Font | Pemakaian |
|---|---|---|
| Judul dan logo | **Fraunces** | Serif lembut miring, hangat dan nostalgia. Semi Bold atau Bold Italic |
| Teks dan caption | **Nunito** | Sans-serif bulat, ramah dan playful. Regular untuk teks, ExtraBold untuk tombol dan label |

Skala dari guide:

| Elemen | Gaya |
|---|---|
| Body | Nunito 400, 16px, line-height 1.6 |
| H2 | Fraunces italic 600, `clamp(26px, 5vw, 38px)`, line-height 1.15 |
| H3 | Fraunces 19px |
| Caption | 13px, opacity .75 |
| Tombol dan label | Nunito 800 |

### Memuat font (self-host, wajib untuk kiosk offline)

Guide asli memakai tag Google Fonts. **Jangan dipakai di kiosk**, karena booth harus jalan tanpa internet. Pakai `next/font`, yang mengunduh saat build dan menyajikan dari server sendiri:

```ts
import { Fraunces, Nunito } from 'next/font/google';

export const fraunces = Fraunces({
  subsets: ['latin'], style: ['normal', 'italic'], weight: ['500', '600', '700'],
  variable: '--font-display',
});
export const nunito = Nunito({
  subsets: ['latin'], weight: ['400', '600', '800'], variable: '--font-body',
});
```

Pasangkan `--font-display` dan `--font-body` ke `fontFamily` di atas, beserta fallback Georgia dan system-ui.

## 5. Suara dan gaya bicara

| | Contoh |
|---|---|
| **Ya**: pendek, manis, relatable | "Momen kamu, jadi charm kamu." · "Berdua lebih lucu, apalagi pakai charm kembar." |
| **Tidak**: terlalu formal atau lebay | "Kami menyediakan layanan fotografi terpadu." · "OMG BANGET GUYS WAJIB BELI SEKARANG!!!" |

| Elemen | Isi |
|---|---|
| Tagline utama | Wear your memories. |
| Tagline pendukung | Snap it. Charm it. Keep it. |
| Hashtag | #WearYourChamera |
| Sapaan | kamu, kita (bukan "Anda") |

Semua teks UI (tombol, pesan error, reminder, halaman download) memakai sapaan **kamu/kita**, pendek, dan hangat. Pesan error tetap jelas dan jujur, tanpa lebay.

## 6. Resep komponen (dari guide)

| Komponen | Spesifikasi |
|---|---|
| Kartu | Latar putih (`--card`), radius 18px, border 1px `--line`, padding 18px |
| Pembatas section | Garis putus-putus 1.5px `--line` |
| Tombol/label | Nunito 800, warna utama Cherry dengan teks Cream |
| Swatch | Radius 18px, border 1px `--line`, area warna tinggi 92px |
| Strip foto (mock) | Latar Cream, padding 14px 14px 22px, border 2px Charcoal, bayangan `6px 6px 0` Cherry, caption Fraunces italic 600 13px ("chamera · 2026") |
| Kotak kemasan (mock) | Latar Cherry, radius 10px, bayangan `0 8px 0 #A81E2D`, garis putus-putus Rose di dalam |
| Post Instagram (mock) | Latar Rose, teks Charcoal Fraunces italic 700, hashtag Nunito 600 Cherry |

## 7. Penerapan di sistem photobooth

Bagian ini menerjemahkan brand ke fitur. Item bertanda *(usulan)* adalah turunan dari guide dan belum tertulis di sana, jadi bisa diubah.

### Kiosk

- Latar halaman Film Cream, teks Charcoal, aksi utama (Start, Lanjutkan, Print) Cherry dengan teks Cream. Tombol besar (min 64 px) sesuai PRD.
- Judul layar memakai Fraunces italic, tombol dan label memakai Nunito ExtraBold.
- Logo utama di Home, ikon saja untuk header kecil.
- Teks bawaan untuk pengaturan Home dan Closing *(usulan)*: Home "Wear your memories." dengan sub "Snap it. Charm it. Keep it."; Closing "Momen kamu, jadi charm kamu." dan hashtag #WearYourChamera. Admin tetap bisa mengubahnya di dashboard.
- Pop-up reminder dan pesan error memakai suara brand: pendek dan hangat *(usulan)*.
- Kiosk memakai tema terang saja *(usulan)*, agar tampilan layar konsisten dengan hasil cetak.

### Dashboard admin dan halaman download

- Dashboard boleh memakai token tema gelap dan terang di atas, dengan Cherry sebagai aksen utama.
- Halaman download memakai kartu putih di atas Cream, logo utama, tagline pendukung, dan hashtag. Tombol Unduh memakai gaya tombol utama.
- Cek kontras sebelum memakai teks kecil di atas Rose, Butter, atau Sky *(usulan)*. Gunakan Charcoal untuk teks di atas tiga warna itu.

### Desain frame (green screen)

- Canvas 4R: 1200 x 1800 px (atau 1800 x 1200). Area foto diisi **hijau murni #00FF00 dan hanya untuk slot**. Desain lain tidak boleh memakai warna itu.
- Gunakan palet brand untuk frame bawaan: latar Cream, aksen Cherry/Rose/Butter/Sky, garis Charcoal, caption Fraunces italic seperti pada mock strip.
- Sisakan area custom text (maks 30 karakter) dengan kontras yang cukup. Pilihan font dan warna teks di admin sebaiknya dibatasi ke Fraunces/Nunito dan palet di atas *(usulan)*.
- Edisi spesial memakai Sky Memory sebagai aksen.

## 8. Checklist sebelum merge UI

- [ ] Warna hanya dari palet atau token turunan di atas, dan proporsinya mendekati Cream 50 / Cherry 25.
- [ ] Teks di atas Cherry berwarna Cream.
- [ ] Judul Fraunces, teks Nunito, tombol dan label Nunito ExtraBold.
- [ ] Font di-self-host, tanpa request ke CDN pada kiosk.
- [ ] Sapaan "kamu/kita", teks pendek dan hangat.
- [ ] Logo mengikuti aturan ruang kosong, ukuran minimum, dan tanpa distorsi atau bayangan.
