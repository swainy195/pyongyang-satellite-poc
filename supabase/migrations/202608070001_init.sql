create extension if not exists postgis with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists vector with schema extensions;

create table public.import_batches (
  id uuid primary key default extensions.gen_random_uuid(),
  source_file_name text not null,
  file_checksum text not null,
  parser_version text not null,
  status text not null default 'queued',
  validation_result jsonb not null default '{}'::jsonb,
  imported_at timestamptz not null default now(),
  unique(source_file_name, file_checksum, parser_version)
);

create table public.raw_import_rows (
  id bigint generated always as identity primary key,
  import_batch_id uuid not null references public.import_batches(id) on delete cascade,
  source_sheet_name text,
  source_row_number integer not null,
  record_type text not null,
  raw_data jsonb not null,
  created_at timestamptz not null default now()
);

create table public.admin_boundaries (
  id uuid primary key default extensions.gen_random_uuid(),
  admin_code text not null,
  source_nid text,
  admin_name text not null,
  province_name text,
  municipality_name text,
  city_name text,
  district_name text,
  admin_class text,
  reference_year integer not null,
  geometry_version text not null,
  geom extensions.geometry(MultiPolygon, 4326) not null,
  raw_properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(admin_code, geometry_version)
);
create index admin_boundaries_geom_gix on public.admin_boundaries using gist(geom);

create table public.facilities (
  id uuid primary key default extensions.gen_random_uuid(),
  source_facility_no bigint not null unique,
  facility_name text not null,
  category_path text,
  category_levels text[] not null default '{}',
  address_text text,
  admin_area_id uuid references public.admin_boundaries(id),
  source_x double precision,
  source_y double precision,
  source_crs text,
  geom extensions.geometry(Point, 4326),
  coordinate_status text not null default 'pending' check (coordinate_status in ('pending','transformed','verified','invalid')),
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index facilities_geom_gix on public.facilities using gist(geom);
create index facilities_admin_area_idx on public.facilities(admin_area_id);

create table public.trends (
  id uuid primary key default extensions.gen_random_uuid(),
  source_trend_no bigint not null unique,
  title text,
  body_text text,
  published_at timestamptz,
  event_start_date date,
  event_end_date date,
  category text,
  source_name text not null default '북한정보포털',
  source_url text,
  admin_codes text[] not null default '{}',
  topics text[] not null default '{}',
  content_hash text,
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.trend_facilities (
  trend_id uuid not null references public.trends(id) on delete cascade,
  facility_id uuid not null references public.facilities(id) on delete cascade,
  source_row_count integer not null default 1,
  link_method text not null default 'source_provided',
  review_status text not null default 'accepted',
  created_at timestamptz not null default now(),
  primary key(trend_id, facility_id)
);

create table public.facility_attributes (
  id bigint generated always as identity primary key,
  facility_id uuid references public.facilities(id) on delete cascade,
  source_facility_no bigint not null,
  attribute_name text not null,
  attribute_value text not null,
  attribute_order integer,
  normalized_value_text text,
  parsed_value_number numeric,
  parsed_unit text,
  parsed_value_date date,
  parse_status text not null default 'raw',
  is_exact_duplicate boolean not null default false,
  source_row_number integer,
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index facility_attributes_facility_idx on public.facility_attributes(facility_id);
create index facility_attributes_name_idx on public.facility_attributes(attribute_name);

create table public.nightlight_stats (
  id bigint generated always as identity primary key,
  admin_area_id uuid references public.admin_boundaries(id),
  facility_id uuid references public.facilities(id),
  grid_id text,
  period_type text not null,
  period_start date not null,
  period_end date not null,
  buffer_meters integer,
  mean_radiance double precision,
  median_radiance double precision,
  sum_radiance double precision,
  lit_area_km2 double precision,
  valid_observation_ratio double precision,
  data_status text not null,
  gee_dataset_id text not null,
  processing_version text not null,
  created_at timestamptz not null default now()
);

create table public.forest_stats (
  id bigint generated always as identity primary key,
  admin_area_id uuid references public.admin_boundaries(id),
  facility_id uuid references public.facilities(id),
  grid_id text,
  year integer not null,
  buffer_meters integer,
  baseline_treecover_threshold integer not null,
  baseline_treecover_km2 double precision,
  annual_loss_km2 double precision,
  cumulative_loss_km2 double precision,
  remaining_treecover_km2 double precision,
  gee_dataset_id text not null,
  processing_version text not null,
  created_at timestamptz not null default now()
);

create table public.documents (
  id uuid primary key default extensions.gen_random_uuid(),
  source_type text not null,
  source_name text not null,
  title text not null,
  body_text text,
  published_at timestamptz,
  event_start_date date,
  event_end_date date,
  source_url text,
  storage_path text,
  reliability_grade text,
  copyright_type text,
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.document_chunks (
  id bigint generated always as identity primary key,
  document_id uuid not null references public.documents(id) on delete cascade,
  chunk_index integer not null,
  section_title text,
  chunk_text text not null,
  page_number integer,
  admin_codes text[] not null default '{}',
  facility_ids uuid[] not null default '{}',
  topics text[] not null default '{}',
  embedding extensions.vector(1536),
  unique(document_id, chunk_index)
);

create table public.reports (
  id uuid primary key default extensions.gen_random_uuid(),
  title text not null,
  report_type text not null default 'admin-period',
  admin_codes text[] not null default '{}',
  facility_ids uuid[] not null default '{}',
  period_start date,
  period_end date,
  status text not null default 'queued',
  request_parameters jsonb not null,
  result_json jsonb,
  report_markdown text,
  html_storage_path text,
  pdf_storage_path text,
  model_name text,
  prompt_version text,
  processing_version text,
  created_by uuid,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.report_evidence (
  id uuid primary key default extensions.gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  evidence_id text not null,
  evidence_type text not null,
  document_id uuid references public.documents(id),
  facility_id uuid references public.facilities(id),
  satellite_stat_type text,
  satellite_stat_id bigint,
  quoted_text text,
  source_title text,
  source_url text,
  source_published_at timestamptz,
  citation_order integer,
  created_at timestamptz not null default now(),
  unique(report_id, evidence_id)
);

alter table public.admin_boundaries enable row level security;
alter table public.facilities enable row level security;
alter table public.trends enable row level security;
alter table public.documents enable row level security;
alter table public.reports enable row level security;

-- 실제 공개 전에는 공개 가능 필드와 저작권 조건을 검토한 별도 뷰·정책을 추가합니다.
