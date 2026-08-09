-- Persistent satellite statistics for the live Supabase schema.
-- facility_id is bigint because the imported facilities table uses facility_id as its key.
create table if not exists public.nightlight_stats (
  id bigint generated always as identity primary key,
  facility_id bigint,
  admin_code text,
  year integer not null,
  mean_radiance double precision,
  max_radiance double precision,
  min_radiance double precision,
  pixel_count integer,
  buffer_meters integer not null default 500,
  data_status text not null default 'ok',
  gee_dataset_id text not null,
  processing_version text not null,
  created_at timestamptz not null default now(),
  unique (facility_id, year)
);

create table if not exists public.forest_stats (
  id bigint generated always as identity primary key,
  facility_id bigint,
  admin_code text,
  year integer not null,
  annual_loss_km2 double precision,
  cumulative_loss_km2 double precision,
  buffer_meters integer not null default 500,
  data_status text not null default 'ok',
  gee_dataset_id text not null,
  processing_version text not null,
  created_at timestamptz not null default now(),
  unique (facility_id, year)
);

create index if not exists nightlight_stats_facility_year_idx on public.nightlight_stats (facility_id, year);
create index if not exists forest_stats_facility_year_idx on public.forest_stats (facility_id, year);
