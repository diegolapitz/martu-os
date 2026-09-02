create table if not exists public.client_logos (
  client_id bigint primary key references public.clients(id) on delete cascade,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  image_data bytea not null,
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 750000),
  updated_at timestamptz not null default now()
);

