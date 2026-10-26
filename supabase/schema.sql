-- Charmera order form schema. Safe to run more than once in the Supabase SQL editor.

create extension if not exists pgcrypto;

-- ---------- Tables ----------

create table if not exists packages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price integer not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table packages add column if not exists items text[] not null default '{}';
alter table packages add column if not exists included_charms integer not null default 0;
alter table packages add column if not exists sort_order integer not null default 0;

create table if not exists charms (
  id uuid primary key default gen_random_uuid(),
  emoji text not null default '',
  name text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
alter table charms add column if not exists image_url text;
alter table charms add column if not exists catalog_index integer;
alter table charms add column if not exists price integer;
alter table charms alter column emoji set default '';

create table if not exists settings (
  id integer primary key default 1,
  slot_count integer not null default 9,
  admin_password text not null default 'admin123',
  whatsapp_number text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table settings add column if not exists batch_label text default 'Open PO Batch 2';
alter table settings add column if not exists charm_price integer default 7000;
alter table settings add column if not exists custom_charm_price integer default 10000;
alter table settings add column if not exists keychain_price integer default 10000;
alter table settings add column if not exists keychain_double_price integer default 10000;
alter table settings add column if not exists pickup_options text[];
alter table settings add column if not exists qris_image_url text;
-- Keychain shapes customers may choose; null means all shapes.
alter table settings add column if not exists keychain_shapes text[];
insert into settings (id) values (1) on conflict (id) do nothing;

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  package_id uuid references packages(id) on delete set null,
  package_name text not null,
  package_price integer not null default 0,
  charms text[] not null default '{}',
  slot_count integer not null default 0,
  photo_url text,
  zoom_level numeric not null default 1,
  quantity integer not null default 1,
  total_price integer not null,
  customer_name text not null,
  customer_whatsapp text not null,
  customer_address text not null default '',
  status text not null default 'Menunggu verifikasi',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table orders add column if not exists order_code text;
alter table orders add column if not exists items jsonb;
alter table orders add column if not exists customer_email text;
alter table orders add column if not exists customer_instagram text;
alter table orders add column if not exists pickup_method text;
alter table orders add column if not exists payment_proof_url text;
create unique index if not exists orders_order_code_key on orders (order_code);

-- ---------- Row level security for the public form ----------

alter table packages enable row level security;
alter table charms enable row level security;
alter table settings enable row level security;
alter table orders enable row level security;

drop policy if exists "public read active packages" on packages;
create policy "public read active packages" on packages for select using (is_active);

drop policy if exists "public read active charms" on charms;
create policy "public read active charms" on charms for select using (is_active);

drop policy if exists "public insert orders" on orders;
create policy "public insert orders" on orders for insert with check (true);

-- The settings row holds admin_password, so the public may only read the non-secret columns.
drop policy if exists "public read settings" on settings;
create policy "public read settings" on settings for select using (true);
revoke select on settings from anon;
grant select (id, slot_count, batch_label, charm_price, custom_charm_price, keychain_price, keychain_double_price, pickup_options, qris_image_url, keychain_shapes) on settings to anon;

-- ---------- Storage for customer photos and payment proofs ----------

insert into storage.buckets (id, name, public)
values ('order-uploads', 'order-uploads', true)
on conflict (id) do nothing;

drop policy if exists "public upload order files" on storage.objects;
create policy "public upload order files" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'order-uploads');
