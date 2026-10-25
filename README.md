# Chamera Form - Wear your memories

Form pemesanan charm bracelet dan gantungan kunci foto untuk Chamera photobooth.

## Tech Stack

- **Framework**: Next.js 16 with App Router
- **Database**: Supabase (PostgreSQL)
- **Styling**: Tailwind CSS
- **Deployment**: Vercel

## Setup

### 1. Clone & Install

```bash
npm install
```

### 2. Setup Supabase

1. Buat project baru di [supabase.com](https://supabase.com)
2. Jalankan SQL di `supabase/schema.sql` di SQL Editor Supabase
3. Copy URL dan keys dari Project Settings > API

### 3. Environment Variables

Copy `.env.example` ke `.env.local`:

```bash
cp .env.example .env.local
```

Isi dengan nilai dari Supabase:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### 4. Aset desain

Ilustrasi asli ada di `assets/*.svg` (ekspor Figma, ukurannya besar). Versi web-nya sudah ada di `public/assets` dan `public/charms`. Kalau SVG di `assets/` diganti, jalankan ulang:

```bash
node scripts/export-assets.mjs
```

Gambar QRIS: taruh di `public/assets/qris.png`, atau isi URL-nya di admin > Pengaturan.

### 5. Run Development

```bash
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000)

## Deploy to Vercel

1. Push ke GitHub
2. Import di Vercel
3. Add environment variables di Vercel dashboard

## Struktur

```
src/
├── app/
│   ├── page.tsx          # Form pemesanan
│   ├── admin/page.tsx    # Admin panel
│   ├── layout.tsx        # Root layout
│   └── globals.css       # Styling
├── lib/
│   └── supabase.ts       # Supabase client
public/
└── assets/
    └── logo.png          # Logo Chamera
```

## Admin Panel

Akses di `/admin`. Default password: `admin123` (ganti di settings).

Fitur:
- Lihat & update status pesanan
- Kelola paket (tambah/edit/hapus)
- Kelola charm
- Pengaturan form (slot, password, WhatsApp)
