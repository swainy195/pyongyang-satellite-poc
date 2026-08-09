# 평양 위성정보 분석 PoC — VS Code 개발 마스터 기획서

> 문서 버전: 1.0  
> 작성 기준일: 2026-08-07  
> 대상 독자: 기획자, GIS·데이터 엔지니어, 백엔드·프런트엔드 개발자, 분석보고서 검수자  
> 목적: 이 문서의 순서대로 저장소를 구성하고 PoC를 실행할 수 있도록 요구사항, 데이터, 설계, 구현 및 검증 기준을 한 문서에 통합한다.

---

## 0. 핵심 결정 요약

- 분석 대상은 **평양과 평양 하위 행정구역**이다.
- 야간조도는 **NOAA VIIRS DNB Monthly**, 수목피복 손실은 **Hansen Global Forest Change**를 Google Earth Engine에서 처리한다.
- 위성자료 기간은 서로 다르므로 UI에서 지표별 가용기간을 따로 표시한다.
- 첨부 행정경계는 **2009년 기준**이며, 현재 경계처럼 표현하지 않는다.
- 시설물 원본은 `시설물번호`별 마스터와 `동향번호–시설물번호` 다대다 관계로 분리한다.
- 시설물 속성은 종류가 많고 반복될 수 있으므로 세로형 속성 테이블로 저장한다.
- Supabase는 PostgreSQL·PostGIS·Storage·RLS를 담당한다. 대용량 원본 위성 래스터는 DB에 직접 넣지 않는다.
- 표현 UI는 **스와이프 비교 + 변화량 레이어 + 타임라인 + 축척별 상세화**를 기본으로 한다.
- LLM은 계산하지 않는다. 백엔드가 만든 근거 패키지 안에서만 문장을 작성한다.
- 최우선 선행조건은 **시설물 X·Y 좌표의 원본 CRS 확인**이다. CRS 확정 전에는 `geom`을 생성하지 않는다.

---

## 1. 프로젝트 목표

### 1.1 사용자 목표

일반 국민이 지도에서 두 시점의 평양 변화를 직관적으로 비교하고, 행정구역·시설물·전체동향·공개 문서를 근거로 변화의 맥락을 확인할 수 있게 한다.

### 1.2 제공 기능

1. 평양 행정구역 탐색
2. VIIRS 야간조도 연도·월별 조회
3. Hansen 수목피복 손실 조회
4. 기준연도와 비교연도의 스와이프·분할 비교
5. 선택 기간 변화량과 핫스폿 표시
6. 줌 수준별 행정경계·시설물 상세화
7. 시설물 기본정보·속성·연결 전체동향 조회
8. 위성 관측과 문서 근거를 결합한 분석보고서 생성
9. 보고서의 수치·인용·처리 버전 추적

### 1.3 PoC 제외 범위

- VIIRS로 1990년부터 야간조도를 제공하지 않는다.
- Hansen으로 1990년대 또는 공개 최신연도 이후 손실을 추정하지 않는다.
- 전체동향과 위성변화의 시간·공간 일치를 인과관계로 단정하지 않는다.
- CRS가 확인되지 않은 시설물 좌표를 임의 변환하지 않는다.
- 원본 위성 전체 래스터를 Supabase PostgreSQL에 저장하지 않는다.

---

## 2. 데이터 인벤토리와 검증 결과

### 2.1 첨부파일

| 파일 | 용도 | 확인 결과 |
|---|---|---|
| `NK_Admin_Boundary.geojson` | 행정경계 | Feature 716개, 고유 `admcd` 205개, 고유 `nid` 205개 |
| `README_NK_Admin_Boundary.md` | 경계 설명 | 기준연도 2009, WGS84 경위도 추정, 좌표 순서 경도·위도 |
| `북한지도 시설물 데이터.xlsx` | 동향–시설물 관계 및 시설물 원본 | 17,774행, 고유 시설물 1,718개, 고유 동향번호 9,829개 |
| `북한지도 시설물 속성 데이터.xlsx` | 시설물 자유형 속성 | 5,585행, 속성 보유 시설물 1,468개, 고유 속성명 285개 |
| `전체동향 데이터.xlsx` | 전체동향 본문·메타데이터 | 프로젝트 입력 디렉터리에 배치 후 컬럼 자동 탐지·연결률 검증 |

### 2.2 행정경계 품질

- GeoJSON 최상위 유형은 `FeatureCollection`이다.
- Geometry 유형 분포는 `{'MultiPolygon': 716}`이다.
- 동일 `admcd`가 여러 Feature에 존재할 수 있으므로 적재 전 코드별로 병합한다.
- 평양 문자열 기준으로 탐지된 Feature는 22개이며 고유 행정코드는 19개이다.
- 행정구역명에는 개행·중복 공백이 있을 수 있으므로 정규화 컬럼을 별도로 만든다.
- 2009년 기준 경계임을 지도 범례와 보고서에 표시한다.

### 2.3 시설물 관계 품질

- 고유 `동향번호–시설물번호` 조합은 17,526개이다.
- 동일 조합의 추가 중복 행은 248개이다.
- 주소 문자열에 `평양`이 포함된 고유 시설물은 445개이며, 관련 고유 동향번호는 5,626개이다.
- 시설물명은 중복될 수 있으므로 식별자로 사용하지 않는다.
- 원천 식별자는 `시설물번호`, 전체동향 연결키는 `동향번호`로 사용한다.

### 2.4 시설물 속성 품질

- 완전 중복 속성 행은 86개이다.
- 시설물 마스터와 연결되지 않는 속성 측 시설물번호는 40개이다.
- 속성이 없는 시설물은 290개이다.
- 동일 시설물에 같은 속성명이 여러 번 존재할 수 있으므로 `(시설물번호, 속성명)`에 유일 제약을 두지 않는다.
- 숫자·단위·날짜 파싱 결과와 원문 값을 함께 보존한다.

### 2.5 데이터 가용기간

| 데이터 | 권장 표시 기간 | 주의사항 |
|---|---|---|
| VIIRS DNB Monthly | 2012-04 이후 공개 최신 월 | 최신 연도는 동일 월 YTD 비교 |
| Hansen GFC | 2000년 기준 수관피복, 2001년 이후 버전별 손실연도 | `loss`는 수목피복 손실이며 영구 산림전용과 동일하지 않음 |
| 행정경계 | 2009년 기준 | 현재 경계가 아님 |
| 전체동향·문서 | 원자료 발행·사건 기간 | 게시일과 사건일을 분리 |

> 데이터셋의 종료연도와 버전은 배포 시점에 공식 카탈로그를 확인해 설정 파일로 고정한다.

---

## 3. 사용자 경험과 화면 설계

### 3.1 기본 레이아웃

```text
┌───────────────────────────────────────────────────────────────┐
│ 지역 | 지표 | 기준연도 | 비교연도 | 비교모드 | 보고서 생성   │
├──────────────┬───────────────────────────────┬────────────────┤
│ 레이어 패널  │ 지도                          │ 상세 패널      │
│ 표시/순서    │ 스와이프·분할·변화량          │ 지역·시설물    │
│ 투명도/필터  │ 범례·축척·데이터 상태         │ 통계·문서      │
├──────────────┴───────────────────────────────┴────────────────┤
│ 타임라인 재생 | 야간조도 추세 | 수목피복 손실 | 근거 목록     │
└───────────────────────────────────────────────────────────────┘
```

### 3.2 비교 모드

| 모드 | 목적 | 구현 원칙 |
|---|---|---|
| 스와이프 | 같은 위치의 두 연도 직접 비교 | 모바일·일반 사용자 기본값 |
| 좌우 분할 | 두 지도를 동시에 비교 | 중심·줌·회전·기울기 동기화 |
| 변화량 | `비교연도 - 기준연도` 강조 | 고정 임계값과 발산형 범례 |
| 타임라인 | 변화 흐름 재생 | 다음 프레임 사전 로드, 자료 없는 연도 비활성화 |

### 3.3 레이어 순서

아래에서 위 순서로 렌더링한다.

1. 저채도 배경지도
2. 행정구역 면
3. VIIRS 야간조도
4. Hansen 선택 기간 수목피복 손실
5. 결합 변화·핫스폿
6. 행정구역 경계선
7. 시설물 클러스터
8. 개별 시설물
9. 선택 객체 강조
10. 행정구역·시설물 라벨

### 3.4 줌 수준별 표현

| MapLibre 줌 | 표시 내용 |
|---:|---|
| 5–7 | 북한 전체, 시·도급 경계 |
| 8–9 | 평양과 구역·군 경계 |
| 10–11 | 시설물 클러스터, 변화 핫스폿 |
| 12–13 | 개별 시설물과 유형 |
| 14 이상 | 시설물명, 속성 요약, 분석 반경 |

`minzoom`, `maxzoom`, MapLibre 표현식과 클러스터를 사용한다. 지도 객체는 React state가 아니라 `ref`로 관리하여 이동 이벤트마다 전체 화면이 재렌더링되지 않게 한다.

### 3.5 시각화 원칙

- 야간조도는 전체 분석기간에서 고정한 범례를 사용한다.
- 필요하면 화면 표시값에 `asinh` 변환을 적용하되 팝업에는 원 단위 값을 보여준다.
- 수목피복 손실은 기본적으로 `기준연도+1 ~ 비교연도` 신규 손실을 표시한다.
- 두 연속형 래스터를 동시에 진하게 칠하지 않는다. 야간조도를 바탕으로, 수목피복 손실은 외곽선·패턴 또는 제한된 강조색으로 표시한다.
- 색상만으로 상태를 전달하지 않고 기호·패턴·텍스트를 함께 제공한다.
- 자료 없음, 관측 부족, 잠정치, 처리 오류를 서로 다른 UI 상태로 표현한다.
- `prefers-reduced-motion`을 지원하고 애니메이션 정지 기능을 제공한다.

### 3.6 지도 상태 URL 공유

```text
/map?admin=PY-001&metric=nightlight&baseYear=2014&compareYear=2024&mode=swipe
```

지도 조건을 URL Query Parameter와 Zustand 상태에 동기화한다.

---

## 4. 기술 스택

| 영역 | 기술 |
|---|---|
| 프런트엔드 | React, TypeScript, Vite, MapLibre GL JS, TanStack Query, Zustand, ECharts |
| 백엔드 | Python 3.12+, FastAPI, Pydantic, SQLAlchemy, GeoAlchemy2 |
| ETL | pandas, openpyxl, GeoPandas, Shapely, pyproj |
| DB·인증 | Supabase PostgreSQL, PostGIS, Auth, RLS |
| 파일 | Supabase Storage 또는 GCS |
| 위성 처리 | Google Earth Engine Python API |
| 문서 처리 | BeautifulSoup, PyMuPDF/pdfplumber, OCR, PostgreSQL FTS, 선택적 pgvector |
| 보고서 | Jinja2, WeasyPrint 또는 Playwright PDF |
| 테스트 | pytest, Vitest, Playwright |
| 운영 | Docker, Docker Compose, GitHub Actions, Cloud Run/Cloud Run Job |
| 모니터링 | Sentry, Cloud Logging, Supabase 로그 |

---

## 5. 시스템 아키텍처

```text
Google Earth Engine
  ├─ VIIRS 월·연 합성 및 행정구역 통계
  ├─ Hansen 연도별 손실 및 누적 통계
  └─ 타일 또는 COG 산출
             │
             ▼
Supabase
  ├─ PostgreSQL/PostGIS: 경계·시설물·동향·통계·근거
  ├─ Storage: 원본 문서·GeoJSON·보고서·소형 산출물
  ├─ Auth/RLS
  └─ 선택적 pgvector
             │
             ▼
FastAPI + Worker
  ├─ 지도·통계·검색 API
  ├─ 근거 패키지 생성
  ├─ 보고서 생성·검증
  └─ PDF 렌더링
             │
             ▼
React + MapLibre
  ├─ 스와이프·분할·변화량
  ├─ 축척별 레이어
  ├─ 시설물·문서 상세
  └─ 보고서 요청·다운로드
```

---

## 6. 저장소 구조

```text
pyongyang-satellite-poc/
├── .github/workflows/ci.yml
├── .vscode/
│   ├── extensions.json
│   ├── launch.json
│   └── settings.json
├── apps/
│   ├── api/
│   │   ├── app/
│   │   │   ├── api/v1/
│   │   │   ├── core/
│   │   │   ├── db/
│   │   │   ├── models/
│   │   │   ├── schemas/
│   │   │   ├── services/
│   │   │   ├── reports/
│   │   │   ├── workers/
│   │   │   └── main.py
│   │   ├── tests/
│   │   └── pyproject.toml
│   └── web/
│       ├── src/
│       │   ├── components/map/
│       │   ├── components/analysis/
│       │   ├── features/map-layers/
│       │   ├── features/comparison/
│       │   ├── features/timeline/
│       │   ├── features/reports/
│       │   ├── services/
│       │   ├── stores/
│       │   ├── styles/
│       │   └── types/
│       ├── tests/
│       └── package.json
├── packages/shared-types/
├── pipelines/
│   ├── etl/
│   │   ├── admin.py
│   │   ├── facilities.py
│   │   ├── attributes.py
│   │   ├── trends.py
│   │   └── validate.py
│   ├── gee/
│   │   ├── nightlights.py
│   │   ├── forest.py
│   │   └── exports.py
│   └── documents/
├── supabase/
│   ├── migrations/
│   ├── seed.sql
│   └── config.toml
├── data/
│   ├── import/.gitkeep
│   ├── interim/.gitkeep
│   └── reports/.gitkeep
├── docs/
├── docker-compose.yml
├── Makefile
├── .env.example
├── .gitignore
└── README.md
```

---

## 7. 개발환경 구성

### 7.1 요구 도구

- VS Code
- Git
- Node.js 22 LTS
- pnpm 9+
- Python 3.12+
- uv 또는 Poetry
- Docker Desktop
- Supabase CLI
- Google Cloud CLI

### 7.2 저장소 초기화

```bash
mkdir pyongyang-satellite-poc
cd pyongyang-satellite-poc
git init
mkdir -p apps/api apps/web pipelines/etl pipelines/gee supabase/migrations data/import docs
pnpm create vite apps/web --template react-ts
cd apps/api && uv init && cd ../..
```

### 7.3 백엔드 패키지

```bash
cd apps/api
uv add fastapi 'uvicorn[standard]' pydantic-settings sqlalchemy geoalchemy2   psycopg[binary] supabase httpx jinja2 weasyprint
uv add --dev pytest pytest-asyncio ruff mypy
```

### 7.4 ETL·위성 패키지

```bash
uv add pandas openpyxl geopandas shapely pyproj earthengine-api
```

### 7.5 프런트엔드 패키지

```bash
cd apps/web
pnpm add maplibre-gl @tanstack/react-query zustand echarts
pnpm add -D vitest @testing-library/react @playwright/test eslint prettier
```

### 7.6 환경변수

```dotenv
APP_ENV=local
API_BASE_URL=http://localhost:8000
WEB_BASE_URL=http://localhost:5173

SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=postgresql+psycopg://postgres:postgres@127.0.0.1:54322/postgres

GEE_PROJECT_ID=
GEE_SERVICE_ACCOUNT=
GOOGLE_APPLICATION_CREDENTIALS=
GCS_BUCKET=

REPORT_LLM_PROVIDER=
REPORT_LLM_MODEL=
REPORT_LLM_API_KEY=
SENTRY_DSN=
```

`SUPABASE_SERVICE_ROLE_KEY`, GEE 서비스 계정, LLM 키는 브라우저 번들에 포함하지 않는다.

### 7.7 `.gitignore`

```gitignore
.env
.env.*
!.env.example
.venv/
node_modules/
dist/
__pycache__/
.pytest_cache/
.ruff_cache/
data/import/*
!data/import/.gitkeep
data/interim/*
!data/interim/.gitkeep
*.tif
*.tiff
*.pdf
```

---

## 8. Supabase/PostGIS 데이터 모델

### 8.1 확장

```sql
create extension if not exists postgis;
create extension if not exists pgcrypto;
create extension if not exists vector;
```

`vector`는 2차 기능에서만 사용해도 된다.

### 8.2 원본 적재 이력

```sql
create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  source_file_name text not null,
  file_checksum text not null,
  parser_version text not null,
  status text not null default 'queued',
  row_count integer,
  error_count integer default 0,
  started_at timestamptz default now(),
  completed_at timestamptz,
  unique (file_checksum, parser_version)
);

create table public.raw_import_rows (
  id bigint generated always as identity primary key,
  import_batch_id uuid not null references public.import_batches(id),
  source_sheet_name text,
  source_row_number integer not null,
  record_type text not null,
  raw_data jsonb not null,
  validation_status text,
  validation_message text,
  imported_at timestamptz default now()
);
```

### 8.3 행정구역

```sql
create table public.admin_boundaries (
  id uuid primary key default gen_random_uuid(),
  admin_code text not null,
  source_nid text,
  admin_name text not null,
  normalized_name text not null,
  province_name text,
  municipality_name text,
  city_name text,
  district_name text,
  admin_class text,
  reference_year integer not null,
  geometry_version text not null,
  geom geometry(MultiPolygon, 4326) not null,
  display_geom geometry(MultiPolygon, 4326),
  raw_properties jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  unique (admin_code, geometry_version)
);
create index admin_boundaries_geom_gix on public.admin_boundaries using gist (geom);
```

### 8.4 시설물

```sql
create table public.facilities (
  id uuid primary key default gen_random_uuid(),
  source_facility_no bigint not null unique,
  facility_name text not null,
  normalized_name text,
  category_path text,
  category_level_1 text,
  category_level_2 text,
  category_level_3 text,
  category_level_4 text,
  category_level_5 text,
  address_text text,
  admin_area_id uuid references public.admin_boundaries(id),
  source_x double precision,
  source_y double precision,
  source_crs text,
  geom geometry(Point, 4326),
  coordinate_status text not null default 'pending',
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index facilities_geom_gix on public.facilities using gist (geom);
create index facilities_admin_idx on public.facilities (admin_area_id);
```

### 8.5 전체동향과 시설물 관계

```sql
create table public.trends (
  id uuid primary key default gen_random_uuid(),
  source_trend_no bigint not null unique,
  title text,
  body_text text,
  published_at timestamptz,
  event_start_date date,
  event_end_date date,
  category text,
  source_name text,
  source_url text,
  admin_codes text[] not null default '{}',
  topics text[] not null default '{}',
  raw_data jsonb not null default '{}'::jsonb,
  content_hash text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.trend_facilities (
  trend_id uuid not null references public.trends(id) on delete cascade,
  facility_id uuid not null references public.facilities(id) on delete cascade,
  source_row_count integer not null default 1,
  first_source_row integer,
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  primary key (trend_id, facility_id)
);
```

전체동향 원본이 적재되기 전에는 `source_trend_no` 기반 staging 관계를 사용한 뒤 `trends.id`로 재연결한다.

### 8.6 시설물 속성

```sql
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
  created_at timestamptz default now()
);
create index facility_attributes_facility_idx on public.facility_attributes (facility_id);
create index facility_attributes_name_idx on public.facility_attributes (attribute_name);
```

### 8.7 위성 통계

```sql
create table public.nightlight_stats (
  id bigint generated always as identity primary key,
  admin_area_id uuid references public.admin_boundaries(id),
  grid_id text,
  period_type text not null,
  period_start date not null,
  period_end date not null,
  mean_radiance double precision,
  median_radiance double precision,
  sum_radiance double precision,
  lit_area_km2 double precision,
  valid_observation_ratio double precision,
  data_status text not null,
  gee_dataset_id text not null,
  processing_version text not null,
  created_at timestamptz default now(),
  unique (admin_area_id, grid_id, period_type, period_start, processing_version)
);

create table public.forest_stats (
  id bigint generated always as identity primary key,
  admin_area_id uuid references public.admin_boundaries(id),
  grid_id text,
  year integer not null,
  baseline_threshold integer not null,
  baseline_treecover_km2 double precision,
  annual_loss_km2 double precision,
  cumulative_loss_km2 double precision,
  remaining_baseline_treecover_km2 double precision,
  gee_dataset_id text not null,
  processing_version text not null,
  created_at timestamptz default now(),
  unique (admin_area_id, grid_id, year, baseline_threshold, processing_version)
);

create table public.facility_satellite_stats (
  id bigint generated always as identity primary key,
  facility_id uuid not null references public.facilities(id) on delete cascade,
  year integer not null,
  buffer_meters integer not null,
  nightlight_mean double precision,
  nightlight_change_pct double precision,
  forest_loss_km2 double precision,
  forest_loss_ratio double precision,
  quality_grade text,
  processing_version text not null,
  created_at timestamptz default now(),
  unique (facility_id, year, buffer_meters, processing_version)
);
```

### 8.8 문서·근거·보고서

```sql
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  source_type text not null,
  source_name text not null,
  external_id text,
  title text not null,
  author text,
  publisher text,
  published_at timestamptz,
  event_start_date date,
  event_end_date date,
  source_url text,
  storage_path text,
  body_text text,
  reliability_grade text,
  copyright_type text,
  raw_data jsonb not null default '{}'::jsonb,
  content_hash text,
  created_at timestamptz default now()
);

create table public.document_chunks (
  id bigint generated always as identity primary key,
  document_id uuid not null references public.documents(id) on delete cascade,
  chunk_index integer not null,
  section_title text,
  page_number integer,
  chunk_text text not null,
  admin_codes text[] default '{}',
  facility_ids uuid[] default '{}',
  topics text[] default '{}',
  embedding vector(1536),
  unique (document_id, chunk_index)
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  report_type text not null,
  admin_codes text[] default '{}',
  facility_ids uuid[] default '{}',
  period_start date,
  period_end date,
  status text not null default 'queued',
  request_parameters jsonb not null,
  evidence_package jsonb,
  result_json jsonb,
  report_markdown text,
  html_storage_path text,
  pdf_storage_path text,
  model_name text,
  prompt_version text,
  processing_version text,
  created_by uuid,
  created_at timestamptz default now(),
  completed_at timestamptz
);

create table public.report_evidence (
  id uuid primary key default gen_random_uuid(),
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
  unique (report_id, evidence_id)
);
```

---

## 9. ETL 구현 명세

### 9.1 공통 원칙

1. 원본 파일의 SHA-256을 계산한다.
2. `import_batches`에 적재 작업을 생성한다.
3. 모든 원본 행을 `raw_import_rows`에 저장한다.
4. 정규화 테이블은 upsert하여 재실행 시 중복을 만들지 않는다.
5. 오류 행을 삭제하지 않고 상태와 메시지를 기록한다.
6. 적재 완료 후 건수·고아키·중복·공간 유효성을 검증한다.

### 9.2 행정경계

```text
GeoJSON 읽기
→ 속성명·행정명 공백/개행 정리
→ make_valid
→ admcd별 dissolve
→ MultiPolygon 통일
→ EPSG:4326 확인
→ 웹용 단순화 Geometry 생성
→ admin_boundaries upsert
```

### 9.3 시설물

```text
Excel 읽기
→ 필수 컬럼 검증
→ 시설물번호별 마스터 추출
→ 같은 번호의 명칭·주소·좌표 충돌 검사
→ 카테고리를 '>' 기준으로 분리
→ 원본 좌표 저장
→ CRS 확정 시에만 WGS84 Point 생성
→ facilities upsert
→ 동향번호–시설물번호 고유 관계 생성
```

### 9.4 시설물 속성

```text
Excel 읽기
→ 열 밀림·결측 검사
→ 시설물번호로 마스터 연결
→ 완전 중복 표시
→ 원문 속성값 보존
→ 숫자·단위·날짜 선택 파싱
→ 고아 시설물번호 상태 기록
```

### 9.5 전체동향

전체동향 파일의 컬럼명을 사전에 고정하지 말고 후보명 매핑을 둔다.

```python
COLUMN_CANDIDATES = {
    'source_trend_no': ['동향번호', '번호', 'id'],
    'title': ['제목', '동향명'],
    'body_text': ['내용', '본문', '상세내용'],
    'published_at': ['등록일', '게시일', '발행일'],
    'category': ['분류', '카테고리'],
    'source_url': ['URL', '원문URL', '링크'],
}
```

적재 후 반드시 아래를 출력한다.

- 총 동향 건수
- 고유 동향번호 수
- 시설물 파일의 동향번호 연결률
- 본문·제목·날짜 결측률
- 중복 동향번호와 충돌 컬럼

### 9.6 실행 명령

```bash
python -m pipelines.etl.admin --input data/import/NK_Admin_Boundary.geojson
python -m pipelines.etl.facilities --input 'data/import/북한지도 시설물 데이터.xlsx'
python -m pipelines.etl.attributes --input 'data/import/북한지도 시설물 속성 데이터.xlsx'
python -m pipelines.etl.trends --input 'data/import/전체동향 데이터.xlsx'
python -m pipelines.etl.validate
```

---

## 10. 시설물 좌표계 검증 게이트

### 10.1 배포 차단 조건

아래가 확정되지 않으면 시설물 공간기능을 공개하지 않는다.

- 원본 CRS 명칭 또는 EPSG 코드
- 축 순서
- 측지계
- 최소 3개 기준점의 알려진 경위도
- 변환 후 북한 범위 포함 여부
- 주소 기반 행정구역과 `ST_Within` 결과의 일치율

### 10.2 변환 후 검증

```sql
select f.id, f.facility_name, a.admin_code, a.admin_name
from public.facilities f
left join public.admin_boundaries a
  on st_within(f.geom, a.geom)
where f.coordinate_status = 'verified';
```

검증 지표:

- 변환 성공률
- 북한 경계 포함률
- 평양 주소 시설물의 평양 경계 포함률
- 주소 행정명과 공간 계산 결과 일치율
- 이상 좌표 목록

---

## 11. Google Earth Engine 분석

### 11.1 VIIRS 야간조도

권장 컬렉션:

```text
NOAA/VIIRS/DNB/MONTHLY_V1/VCMSLCFG
```

핵심 밴드:

- `avg_rad`: 월평균 방사휘도
- `cf_cvg`: 유효 관측 횟수

처리 순서:

```text
기간·평양 경계 필터
→ cf_cvg 품질 마스크
→ 음수·극단값 처리
→ 월별 통계
→ 관측 횟수 가중 연간 합성
→ 행정구역·1km 격자·시설물 버퍼 집계
→ 전년·기준연도 대비 변화
→ DB 적재 및 타일/COG 산출
```

연간 가중평균:

```text
Σ(avg_rad_month × cf_cvg_month) / Σ(cf_cvg_month)
```

2026년 등 미완료 연도는 `provisional_ytd`로 저장하고 전년도 동일 월과만 비교한다.

### 11.2 Hansen 수목피복 손실

처리 순서:

```text
treecover2000 ≥ threshold
→ lossyear를 연도별 마스크로 변환
→ 픽셀 면적 계산
→ 연간·누적 손실
→ 행정구역·1km 격자·시설물 버퍼 집계
→ 선택 기간 신규 손실 레이어 생성
```

기본 임계값은 30%로 시작하되 10%·20%·30% 민감도 결과를 기록한다.

표현 명칭:

- `연도별 수목피복 손실`
- `2000년 기준 수목피복 잔존 추정`

`현재 산림면적`, `확정적 산림파괴`라는 표현은 사용하지 않는다.

### 11.3 결합 분석

공간 단위는 행정구역과 1km 격자를 사용한다. VIIRS와 Hansen 원 픽셀을 직접 일대일 비교하지 않는다.

```text
A: 조도 증가 + 수목피복 손실
B: 조도 증가 + 뚜렷한 손실 없음
C: 조도 유지 + 수목피복 손실
D: 조도 감소 + 뚜렷한 손실 없음
E: 유의한 변화 없음
Q: 품질 부족
```

임계값은 전체 기간 분포와 품질 검토 후 설정 파일에 버전으로 고정한다.

---

## 12. 타일·지도 데이터 제공

### 12.1 PoC

- 행정경계·시설물: GeoJSON API
- 위성 래스터: 백엔드가 관리하는 GEE 지도 타일 또는 미리 생성한 COG 타일
- 통계: FastAPI JSON

### 12.2 확장

- 행정경계·대량 격자: PostGIS `ST_AsMVT`, Martin 또는 pg_tileserv
- 래스터: COG + TiTiler + CDN
- 정적 벡터 산출물: PMTiles

GEE 인증정보를 프런트엔드에 전달하지 않는다. 자주 쓰는 연도는 사전 계산과 캐시를 적용한다.

---

## 13. FastAPI 명세

### 13.1 핵심 엔드포인트

```http
GET  /api/v1/health
GET  /api/v1/data-availability
GET  /api/v1/admin-boundaries
GET  /api/v1/admin-boundaries/{adminCode}
GET  /api/v1/admin-boundaries/{adminCode}/facilities

GET  /api/v1/facilities
GET  /api/v1/facilities/{facilityId}
GET  /api/v1/facilities/{facilityId}/attributes
GET  /api/v1/facilities/{facilityId}/trends
GET  /api/v1/facilities/{facilityId}/satellite-stats

GET  /api/v1/nightlights/monthly
GET  /api/v1/nightlights/annual
GET  /api/v1/forest/loss
GET  /api/v1/change/hotspots
GET  /api/v1/map/tiles/{layer}/{year}/{z}/{x}/{y}

GET  /api/v1/trends
GET  /api/v1/trends/{trendId}
GET  /api/v1/documents/search
GET  /api/v1/documents/{documentId}

POST /api/v1/reports
GET  /api/v1/reports/{reportId}
GET  /api/v1/reports/{reportId}/evidence
GET  /api/v1/reports/{reportId}/download
```

### 13.2 가용성 응답

```json
{
  "nightlights": {
    "start": "2012-04",
    "end": "latest-published-month",
    "latestYearStatus": "provisional"
  },
  "forest": {
    "baselineYear": 2000,
    "lossStartYear": 2001,
    "lossEndYear": "configured-dataset-version"
  },
  "boundary": {
    "referenceYear": 2009,
    "geometryVersion": "nk-admin-2009-v1"
  }
}
```

### 13.3 보고서 작업 상태

```text
queued
collecting_evidence
generating
validating
rendering_pdf
completed
failed
```

보고서 생성은 비동기 Worker에서 실행하고 UI는 상태를 폴링하거나 Realtime으로 구독한다.

---

## 14. 프런트엔드 구현 명세

### 14.1 상태 모델

```ts
export interface MapAnalysisState {
  adminCode: string | null;
  metric: 'nightlight' | 'forest' | 'combined';
  comparisonMode: 'swipe' | 'split' | 'difference' | 'timeline';
  baseYear: number;
  compareYear: number;
  currentTimelineYear: number;
  layerVisibility: {
    admin: boolean;
    nightlight: boolean;
    forestLoss: boolean;
    facilities: boolean;
    hotspots: boolean;
  };
  layerOpacity: {
    nightlight: number;
    forestLoss: number;
    facilities: number;
  };
  facilityCategories: string[];
  selectedFacilityId: string | null;
  mapView: {
    longitude: number;
    latitude: number;
    zoom: number;
    bearing: number;
    pitch: number;
  };
}
```

### 14.2 핵심 컴포넌트

```text
MapCanvas
MapToolbar
LayerPanel
LayerRow
OpacitySlider
CompareModeSelector
SwipeCompare
SplitCompare
TimelinePlayer
MapLegend
DataAvailabilityBadge
AdminSummaryPanel
FacilityDetailPanel
NightlightTrendChart
ForestLossChart
EvidenceList
ReportRequestDialog
```

### 14.3 MapLibre 레이어 예시

```ts
export const facilityPointLayer = {
  id: 'facility-points',
  type: 'circle',
  source: 'facilities',
  minzoom: 12,
  paint: {
    'circle-radius': [
      'interpolate', ['linear'], ['zoom'],
      12, 4,
      16, 8
    ],
    'circle-color': '#2563eb',
    'circle-stroke-color': '#ffffff',
    'circle-stroke-width': 1
  }
} as const;
```

### 14.4 타임라인 성능

```text
현재 표시: Y
사전 로드: Y+1
캐시 유지: Y-1
전환: 200~400ms opacity cross-fade
```

화면 전환일 뿐 데이터의 중간연도를 보간하지 않는다.

### 14.5 접근성

- 지도와 동일 통계의 표 보기 제공
- 키보드 연도·레이어 조작
- ARIA label과 라이브 영역
- 고정 색상 외 패턴·기호 제공
- 애니메이션 정지
- 모바일 하단 시트
- 지원되지 않는 연도의 설명 텍스트

---

## 15. 문서 수집·검색

### 15.1 문서 유형

- 통일부 공개자료
- 북한동향
- 연구보고서
- 공개 기사

### 15.2 처리 순서

```text
원문 수집·Storage 보존
→ HTML/PDF 본문 추출
→ 필요한 파일 OCR
→ 페이지·문단 청크
→ 지명·시설명·날짜·주제 추출
→ 행정구역·시설물 연결
→ PostgreSQL 전문검색
→ 선택적 pgvector 의미 검색
```

구조화 식별자 검색을 벡터 검색보다 우선한다.

1. `동향번호–시설물번호` 직접 연결
2. 행정구역·기간 필터
3. 시설물명·주제 전문검색
4. 필요할 때 의미 유사도 검색

### 15.3 신뢰도 예시

| 등급 | 자료 | 사용 원칙 |
|---|---|---|
| A | 공식 공개자료 | 발표 사실과 게시일 중심 인용 |
| B | 공공기관 동향자료 | 관측과 해석 구분 |
| C | 학술·연구보고서 | 방법론·조사기간 확인 |
| D | 공개 기사 | 단독 확정 근거로 사용하지 않음 |

사이트별 이용약관·공공누리·원문 재배포 조건을 확인한다.

---

## 16. 근거 기반 분석보고서

### 16.1 생성 흐름

```text
사용자 조건
→ 위성 통계 SQL 조회
→ 행정구역·시설물 조회
→ 직접 연결 전체동향 조회
→ 관련 문서 검색
→ 신뢰도·공간·시간 일치도 정렬
→ Evidence Package JSON 생성
→ LLM 초안
→ 숫자·인용·금지표현 검증
→ HTML/PDF 렌더링
→ reports/report_evidence 저장
```

### 16.2 근거 패키지 예시

```json
{
  "analysisTarget": {
    "adminCode": "PY-001",
    "periodStart": "2020-01-01",
    "periodEnd": "2024-12-31"
  },
  "satelliteObservations": [
    {
      "evidenceId": "SAT-001",
      "type": "nightlight",
      "value": 18.3,
      "unit": "percent_change",
      "dataset": "NOAA VIIRS DNB Monthly",
      "processingVersion": "ntl-v1.0"
    }
  ],
  "facilities": [],
  "trends": [],
  "documents": [],
  "limitations": [
    "행정경계는 2009년 기준이다.",
    "위성 관측과 문서 사건의 일치는 인과관계를 증명하지 않는다."
  ]
}
```

### 16.3 LLM 규칙

```text
- 제공된 근거에 없는 수치를 생성하지 않는다.
- 모든 주요 주장에 evidenceId를 표시한다.
- 위성 관측, 문서 확인, 분석 가설을 구분한다.
- 상관관계를 인과관계로 표현하지 않는다.
- 충돌하는 자료는 양쪽을 함께 기술한다.
- 데이터가 없는 연도는 추정하지 않는다.
- 근거가 약하면 가능성으로 표현한다.
```

### 16.4 보고서 목차

1. 분석 개요와 기준일
2. 데이터 가용기간과 방법론
3. 야간조도 변화
4. 수목피복 손실
5. 결합 변화·핫스폿
6. 행정구역·시설물 분석
7. 전체동향·연구·기사 근거
8. 관측 사실과 가능한 해석
9. 한계와 품질
10. 출처·처리 버전·인용 목록

---

## 17. 보안·권한·저작권

### 17.1 권한

| 역할 | 권한 |
|---|---|
| anon | 승인된 공개 통계·시설물 뷰 조회 |
| authenticated | 보고서 요청, 본인 보고서 조회 |
| analyst | 원문·미검토 연결 조회 |
| admin | 적재·수정·재처리 |
| service | 백엔드 Worker 전용 전체 조회 |

RLS를 모든 공개 테이블에 활성화하고 원본 테이블 대신 공개 View 또는 RPC를 제공한다.

### 17.2 파일 정책

- 공개 원문과 비공개 원본을 별도 버킷으로 분리한다.
- 제한 자료는 서명 URL로 제공한다.
- 원문을 재배포할 수 없으면 제목·URL·게시일·허용된 짧은 인용문만 노출한다.
- 키·서비스 계정 JSON·DB 비밀번호를 Git에 커밋하지 않는다.

---

## 18. 테스트 계획

### 18.1 ETL 단위 테스트

- 컬럼 후보명 탐지
- 개행·공백 정규화
- 카테고리 `>` 분리
- 시설물번호별 마스터 생성
- 동향–시설물 중복 집계
- 속성 완전 중복 표시
- 숫자·단위·날짜 파싱
- import checksum 멱등성

### 18.2 공간 테스트

- 모든 행정경계 Geometry 유효성
- `admcd` 병합 후 Feature 수와 면적 변화
- 변환된 시설물의 북한 범위 포함률
- 평양 주소 시설물의 평양 경계 포함률
- 주소 행정구역과 `ST_Within` 결과 일치율
- 시설물 버퍼 면적과 단위 검증

### 18.3 위성 테스트

- 분석 기간 필터
- VIIRS `cf_cvg` 마스크
- 월·연도 가중평균
- YTD 동일 월 비교
- Hansen 연도 코드 변환
- 픽셀면적 합계
- 임계값 10·20·30% 민감도
- 데이터셋·처리 버전 기록

### 18.4 API·E2E

```text
평양 선택
→ 비교연도 선택
→ 야간조도 표시
→ 신규 수목피복 손실 표시
→ 시설물 선택
→ 속성·전체동향 조회
→ 보고서 생성
→ 근거 확인
→ PDF 다운로드
```

### 18.5 보고서 검증

- 보고서 수치가 Evidence Package와 일치
- 모든 `evidenceId`가 `report_evidence`에 존재
- 출처 URL·게시일 누락 검사
- 인과 단정·미지원 연도·금지 용어 검사
- 지도 범례와 본문 단위 일치

---

## 19. 성능 목표

| 항목 | 목표 |
|---|---:|
| 초기 지도 표시 | 3초 이내 |
| 캐시된 연도 전환 | 1초 이내 |
| 시설물 필터 반영 | 500ms 이내 |
| 행정구역 상세 조회 | 1초 이내 |
| 보고서 요청 등록 | 2초 이내 |
| PDF 생성 | 비동기 처리 |

최적화:

- 현재 화면 타일만 요청
- 다음 연도 프리로드
- 웹용 단순화 경계 사용
- 낮은 줌 시설물 클러스터
- 큰 GeoJSON은 벡터 타일 전환
- API 통계 캐시와 타일 CDN 분리

---

## 20. CI/CD와 배포

### 20.1 GitHub Actions

```text
Python Ruff/mypy
→ pytest
→ TypeScript lint/typecheck
→ Vitest
→ migration 검증
→ Docker build
→ staging 배포
→ Playwright smoke test
```

### 20.2 권장 배포

```text
Frontend: Vercel 또는 정적 호스팅
API: Google Cloud Run
Worker: Cloud Run Job
DB/Auth/Storage: Supabase
Satellite: Google Earth Engine
Raster cache: GCS + CDN 또는 Supabase Storage
```

---

## 21. 구현 일정과 티켓

### Sprint 0 — 선행조건

- [ ] Supabase 프로젝트와 로컬 CLI 구성
- [ ] GEE 프로젝트·인증 구성
- [ ] 시설물 CRS 문서 확보
- [ ] 전체동향 파일 컬럼 검사
- [ ] 원자료 이용조건 확인

### Sprint 1 — 데이터 기반

- [ ] DB migration 작성
- [ ] 원본 적재 이력 구현
- [ ] 행정경계 ETL과 코드별 병합
- [ ] 시설물 마스터·관계 ETL
- [ ] 시설물 속성 ETL
- [ ] 전체동향 ETL과 연결률 리포트
- [ ] 데이터 품질 대시보드 또는 검증 리포트

### Sprint 2 — 위성 처리

- [ ] VIIRS 월별·연간 처리
- [ ] Hansen 손실 처리
- [ ] 행정구역 통계 적재
- [ ] 시설물 버퍼 통계 적재
- [ ] 타일·COG 산출과 캐시

### Sprint 3 — 지도 UI

- [ ] MapLibre 기본지도
- [ ] 평양 경계·시설물 클러스터
- [ ] VIIRS·Hansen 레이어
- [ ] 고정 범례·자료상태
- [ ] 스와이프 비교
- [ ] 좌우 분할 카메라 동기화
- [ ] 타임라인과 프리로드
- [ ] 줌 수준별 상세화

### Sprint 4 — 검색·보고서

- [ ] 시설물 상세·속성·동향 조회
- [ ] 문서 추출·전문검색
- [ ] Evidence Package 생성
- [ ] LLM 구조화 출력과 인용 검증
- [ ] HTML/PDF 보고서
- [ ] 보고서 근거 화면

### Sprint 5 — 검증·공개

- [ ] 공간·위성 정확도 검증
- [ ] RLS·Storage 정책
- [ ] E2E·접근성·성능 테스트
- [ ] 출처·한계 문구 검수
- [ ] staging 사용자 테스트
- [ ] PoC 배포

---

## 22. Definition of Done

- [ ] 사용자가 평양 하위 행정구역을 선택할 수 있다.
- [ ] 지원 연도만 선택 가능하고 자료 없음·잠정치가 표시된다.
- [ ] 같은 범례로 두 연도의 야간조도를 비교한다.
- [ ] 선택 기간 신규 수목피복 손실을 표시한다.
- [ ] 스와이프·분할·변화량·타임라인 중 최소 3개 모드가 작동한다.
- [ ] 줌 수준에 따라 경계·클러스터·시설물 상세가 달라진다.
- [ ] 시설물번호로 속성과 전체동향을 조회한다.
- [ ] 시설물 위치는 검증된 CRS 변환 결과만 사용한다.
- [ ] 보고서 수치에 데이터셋·기간·처리 버전이 기록된다.
- [ ] 모든 주요 보고서 주장에 근거 ID가 있다.
- [ ] 위성 관측·문서 확인·분석 가설이 구분된다.
- [ ] 2009년 경계와 Hansen 해석 한계가 표시된다.
- [ ] RLS·비밀키·저작권 정책이 적용된다.
- [ ] CI와 핵심 E2E 테스트가 통과한다.

---

## 23. 첫 실행 체크리스트

```bash
# 1. 환경 파일
cp .env.example .env

# 2. 로컬 Supabase
supabase start
supabase db reset

# 3. 원자료 배치
cp /path/to/NK_Admin_Boundary.geojson data/import/
cp '/path/to/북한지도 시설물 데이터.xlsx' data/import/
cp '/path/to/북한지도 시설물 속성 데이터.xlsx' data/import/
cp '/path/to/전체동향 데이터.xlsx' data/import/

# 4. ETL
python -m pipelines.etl.admin --input data/import/NK_Admin_Boundary.geojson
python -m pipelines.etl.facilities --input 'data/import/북한지도 시설물 데이터.xlsx'
python -m pipelines.etl.attributes --input 'data/import/북한지도 시설물 속성 데이터.xlsx'
python -m pipelines.etl.trends --input 'data/import/전체동향 데이터.xlsx'
python -m pipelines.etl.validate

# 5. API
cd apps/api
uv run uvicorn app.main:app --reload --port 8000

# 6. Web
cd ../web
pnpm install
pnpm dev

# 7. 테스트
cd ../api && uv run pytest
cd ../web && pnpm test
pnpm exec playwright test
```

---

## 24. 공식 출처와 참고문서

### 업로드 자료

- `README_NK_Admin_Boundary.md`: 데이터 개요, 기준연도, Geometry, 좌표 순서 및 추정 좌표계.
- `NK_Admin_Boundary.geojson`: 행정경계 Geometry와 속성.
- `북한지도 시설물 데이터.xlsx`: 동향번호, 시설물번호, 시설물명, 카테고리, 주소, X·Y 좌표.
- `북한지도 시설물 속성 데이터.xlsx`: 시설물번호, 시설물명, 속성명, 속성값.

### 공식 기술문서

- Google Earth Engine: https://developers.google.com/earth-engine
- VIIRS Monthly DNB: https://developers.google.com/earth-engine/datasets/catalog/NOAA_VIIRS_DNB_MONTHLY_V1_VCMSLCFG
- Hansen Global Forest Change: https://developers.google.com/earth-engine/datasets/catalog/UMD_hansen_global_forest_change_2025_v1_13
- Earth Engine map tiles: https://developers.google.com/earth-engine/apidocs/ee-data-getmapid
- Supabase PostGIS: https://supabase.com/docs/guides/database/extensions/postgis
- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase Storage: https://supabase.com/docs/guides/storage
- Supabase vector columns: https://supabase.com/docs/guides/ai/vector-columns
- FastAPI: https://fastapi.tiangolo.com/
- MapLibre GL JS: https://maplibre.org/maplibre-gl-js/docs/
- MapLibre Style Specification: https://maplibre.org/maplibre-style-spec/
- WCAG 2.2: https://www.w3.org/TR/WCAG22/
- PostgreSQL JSON types: https://www.postgresql.org/docs/current/datatype-json.html

---

## 25. 최종 구현 원칙

1. 지도는 변화가 커 보이도록 꾸미는 도구가 아니라 동일 기준으로 비교하는 도구여야 한다.
2. 센서·기간·경계 버전·처리 버전을 모든 통계와 보고서에 남긴다.
3. 원본 데이터, 정규화 데이터, 파생 통계와 해석을 분리한다.
4. 직접 식별자 관계를 의미 검색보다 우선한다.
5. 좌표계와 관측 품질이 검증되지 않은 공간 결과를 공개하지 않는다.
6. LLM은 근거를 선택하거나 수치를 계산하지 않고, 검증된 근거 패키지를 서술한다.
7. 일반 국민에게는 스와이프·고정 범례·짧은 해석을 제공하고, 분석자에게는 원 단위·품질·출처를 제공한다.
