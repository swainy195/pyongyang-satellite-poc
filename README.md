# 평양 위성정보 분석 PoC

VS Code에서 바로 개발할 수 있는 모노레포 스캐폴드입니다.

## 분석 범위

- NOAA VIIRS DNB 월간 야간조도
- Hansen Global Forest Change 수목피복 손실
- 북한 행정경계 GeoJSON
- 북한정보포털 전체동향·시설물·시설물 속성
- 통일부 공개자료, 연구보고서 및 공개 기사
- Supabase/PostgreSQL/PostGIS 기반 통합 저장
- React·MapLibre 기반 연도 비교 지도
- 근거 ID를 사용하는 분석보고서 생성

## 포함된 애플리케이션

```text
apps/api       FastAPI API와 보고서 작업 엔진
apps/web       React·TypeScript·MapLibre 웹 UI
pipelines/etl  첨부 GeoJSON·Excel 정제 및 Supabase 적재 준비
pipelines/gee  VIIRS·Hansen Earth Engine 처리 모듈
supabase       PostGIS 스키마와 초기 마이그레이션
docs           개발 마스터 기획서와 데이터 명세
```

## 첨부 데이터 기준 스키마

- 시설물 시트: `시설물 데이터`
- 시설물 컬럼: 동향번호, 시설물번호, 시설물명, 카테고리, 주소, x좌표, y좌표
- 속성 시트: `시설물 속성 데이터`
- 속성 컬럼: 시설물번호, 시설물명, 속성명, 속성값
- 행정경계 속성: admcd, cl, do, dong, gu, jic, mplis, nid, origin, rm, si, year

원본 데이터는 저작권·용량·재배포 조건과 저장소 비대화를 고려하여 ZIP에 포함하지 않습니다. `data/import/`에 직접 배치합니다.

## 1. 필수 도구

- VS Code
- Git
- Node.js 22 LTS
- pnpm 9 이상
- Python 3.12 이상
- uv
- Docker Desktop
- Supabase CLI
- Google Cloud CLI와 Earth Engine 접근 권한

## 2. 최초 실행

```bash
git init
cp .env.example .env
make install
supabase start
supabase db reset
make api
```

새 터미널에서 웹을 실행합니다.

```bash
make web
```

- API: http://localhost:8000
- API 문서: http://localhost:8000/docs
- Web: http://localhost:5173
- Supabase Studio: Supabase CLI 출력 주소를 확인합니다.

Windows에서 `make`를 사용하지 않는 경우 `.vscode/tasks.json`의 작업을 실행하거나 아래 명령을 직접 사용합니다.

```powershell
cd apps/api
uv sync --dev
uv run uvicorn app.main:app --reload --port 8000

cd apps/web
pnpm install
pnpm dev
```

## 3. 원자료 배치

다음 파일명을 유지하여 `data/import/`에 복사합니다.

```text
NK_Admin_Boundary.geojson
북한지도 시설물 데이터.xlsx
북한지도 시설물 속성 데이터.xlsx
전체동향 데이터.xlsx
```

## 4. ETL 사전검사

```bash
uv run python -m pipelines.etl.inspect_inputs --input-dir data/import
uv run python -m pipelines.etl.admin --input data/import/NK_Admin_Boundary.geojson --output data/interim/admin_boundaries.geojson
uv run python -m pipelines.etl.facilities --input 'data/import/북한지도 시설물 데이터.xlsx' --output-dir data/interim
uv run python -m pipelines.etl.attributes --input 'data/import/북한지도 시설물 속성 데이터.xlsx' --output data/interim/facility_attributes.csv
uv run python -m pipelines.etl.trends --input 'data/import/전체동향 데이터.xlsx' --output data/interim/trends.csv
uv run python -m pipelines.etl.validate --input-dir data/interim
```

시설물 X·Y 좌표의 원본 CRS가 확정되기 전까지 ETL은 원본 좌표만 보존하고 `geom` 생성을 보류합니다. `.env`의 `FACILITY_SOURCE_CRS`를 확인된 EPSG 코드로 설정한 뒤 공간 변환을 수행합니다.

## 5. 주요 VS Code 작업

`Terminal > Run Task`에서 다음 작업을 사용할 수 있습니다.

- API: dev
- Web: dev
- Supabase: start
- Supabase: reset
- ETL: inspect
- Test: all
- Lint: all

## 6. 구현 우선순위

1. Supabase 시작 및 마이그레이션 적용
2. 첨부 데이터 ETL과 품질검사
3. 시설물 원본 좌표계 확정
4. 행정경계·시설물 API
5. MapLibre 기본 지도와 클러스터
6. VIIRS·Hansen GEE 배치 처리
7. 스와이프·좌우 분할·변화량·타임라인 UI
8. 전체동향과 시설물 연결
9. 근거 패키지 기반 보고서 생성
10. PDF·인용·RLS·E2E 검증

## 7. 핵심 원칙

- VIIRS와 Hansen의 실제 가용기간 밖 값은 추정하지 않습니다.
- 2026년 최신 자료는 확보 월까지의 YTD 잠정치로 표시합니다.
- Hansen 결과는 산림파괴가 아니라 수목피복 손실로 기술합니다.
- 연도 비교 지도는 기간 전체에 고정된 범례를 사용합니다.
- 전체동향과 위성 변화의 동시 발생을 인과관계로 단정하지 않습니다.
- LLM은 통계를 계산하지 않고 백엔드가 만든 근거 패키지만 서술합니다.
- 모든 보고서 수치와 주장에 데이터셋·처리 버전·근거 ID를 저장합니다.

자세한 내용은 `docs/MASTER_PLAN.md`를 확인하십시오.
