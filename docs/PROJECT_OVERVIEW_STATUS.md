# 평양 위성정보 분석 PoC

## 1. 프로젝트 개요

이 프로젝트는 북한 지역의 시설정보, 야간조도, 산림변화, 관련 동향을 하나의 지도 기반 분석 화면에서 연결하는 공공정책·연구용 PoC입니다.

핵심 목표는 단순히 위성지도를 보여주는 것이 아니라 다음 분석 흐름을 제공하는 것입니다.

```text
시설 검색
  -> 시설 상세정보
  -> 관련 동향
  -> VIIRS 야간조도 변화
  -> Hansen 산림변화
  -> 관찰과 해석 분리
  -> 분석 보고서 및 PDF
```

분석 결과는 관측값과 해석을 분리하며, 단일 위성지표만으로 원인을 단정하지 않는 것을 원칙으로 합니다.

## 2. 시스템 구성

```text
Vercel
  - React + Vite 지도 화면
  - AI-readable 정적 파일
  - 상태 확인용 Serverless API
        |
        v
Render
  - FastAPI
  - Supabase SDK
  - Google Earth Engine 인증 및 타일/통계 API
        |
        +--> Supabase PostgreSQL/PostGIS
        |
        +--> Google Earth Engine
              - VIIRS Nighttime Lights
              - Hansen Global Forest Change
```

## 3. 데이터 현황

현재 원격 Supabase에 적재된 기본 데이터는 다음과 같습니다.

| 테이블 | 건수 | 용도 |
|---|---:|---|
| `admin_boundaries` | 716 | 행정경계 |
| `facilities` | 1,718 | 북한 시설 위치·기본정보 |
| `facility_attributes` | 5,585 | 시설 속성 |
| `trends` | 42,896 | 관련 동향 |
| `trend_facilities` | 17,525 | 동향-시설 연결 |
| `nightlight_stats` | 24,052 | 시설별 VIIRS 연도 통계 |
| `forest_stats` | 24,052 | 시설별 Hansen 연도 통계 |

위성 통계는 1,718개 시설에 대해 2012~2025년 14개 연도 데이터를 저장합니다.

```text
1,718 facilities x 14 years = 24,052 rows per statistics table
```

## 4. 주요 기능

### 지도

- MapLibre 기반 지도
- OpenStreetMap 배경지도
- 행정경계 레이어
- 시설 위치 레이어
- VIIRS 야간조도 타일
- Hansen 산림변화 타일
- 기준연도·비교연도 선택
- 비교 모드별 레이어 투명도 조정

### 시설 분석

- 시설명 검색
- 검색 결과 선택 시 지도 이동
- 시설 클릭 팝업
- 시설 기본정보·속성 표시
- 시설 관련 동향 표시
- 시설별 연도 시계열 조회
- 야간조도 변화율 계산
- 산림손실 누적값 계산
- 연도별 시계열 막대그래프

### 분석 결과 신뢰성

분석 패널은 다음 정보를 분리해서 표시합니다.

- `관찰`: 데이터에서 직접 계산된 수치와 변화
- `해석`: 관측 결과에서 도출 가능한 참고 의견
- `신뢰도`: 현재 `관측 기반 참고`
- `출처`: VIIRS 및 Hansen 데이터셋

해석 문장은 가능성을 표현하며 시설 운영 원인이나 정책적 결론을 단정하지 않습니다.

### 보고서

- 분석보고서 생성 API
- 선택 시설 분석 결과 포함
- PDF 다운로드
- PDF에 관찰·해석·신뢰도·출처 포함

## 5. FastAPI 주요 endpoint

### 상태 확인

```text
GET /health
GET /health/db
GET /api/v1/data-status
GET /api/v1/gee-status
```

`/api/v1/gee-status`는 다음 작업을 최소 범위로 수행합니다.

- `GEE_PROJECT_ID` 또는 `GOOGLE_CLOUD_PROJECT` 확인
- 기존 Earth Engine 초기화 코드 재사용
- VIIRS ImageCollection metadata 접근
- Hansen Image metadata 접근
- 대규모 분석 없이 데이터셋 접근성 확인

### 지도·시설

```text
GET /api/v1/map/tiles/nightlight/{year}
GET /api/v1/map/tiles/forest/{year}
GET /api/v1/admin-boundaries
GET /api/v1/facilities
GET /api/v1/facilities/{facility_id}
GET /api/v1/facilities/{facility_id}/timeseries
GET /api/v1/facilities/{facility_id}/stats
GET /api/v1/facilities/{facility_id}/analysis
```

### 보고서

```text
POST /api/v1/reports
GET /api/v1/reports/{report_id}
GET /api/v1/reports/{report_id}/pdf
```

## 6. Vercel 상태·AI 접근 API

Vercel 프로젝트에는 정적 안내 파일과 Serverless API가 있습니다.

```text
/robots.txt
/ai-test.html
/llms.txt
/api/ai-context
/api/health
/api/features
/api/data-sources
/api/project-status
```

`/api/project-status`는 다음을 별도로 확인합니다.

```text
frontend  -> Vercel
backend   -> Render /health
database  -> Render /health/db
data      -> Render /api/v1/data-status
satellite -> Render /api/v1/gee-status
```

전체 상태는 다음 규칙을 사용합니다.

```text
모두 정상  -> ok
일부 실패  -> partial
확인 불가  -> unknown
```

각 외부 요청에는 timeout과 개별 예외 처리가 적용되어 하나의 서비스가 실패해도 전체 상태 API가 500으로 종료되지 않습니다.

## 7. 배포 구성

### GitHub

```text
https://github.com/swainy195/pyongyang-satellite-poc
```

현재 기본 브랜치는 `master`입니다.

### Render

FastAPI 배포 설정은 루트의 `render.yaml`에 있습니다.

```text
Root Directory: apps/api
Health Check: /health
Start: uv run uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

필수 환경변수:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
GEE_PROJECT_ID 또는 GOOGLE_CLOUD_PROJECT
GEE_SERVICE_ACCOUNT
GOOGLE_APPLICATION_CREDENTIALS_JSON
WEB_BASE_URL
```

### Vercel

프론트엔드 Root Directory는 `apps/web`입니다.

```text
Framework: Vite
Build: npm run build
Output: dist
```

필수 환경변수:

```text
VITE_API_BASE_URL=https://배포된-render-api.onrender.com
BACKEND_URL=https://배포된-render-api.onrender.com
```

`VITE_API_BASE_URL`에는 `/api/v1`을 붙이지 않습니다. 프론트 코드가 경로를 추가합니다.

## 8. 보안 원칙

- `.env`, `.env.local`은 Git에 올리지 않습니다.
- Supabase service role/secret 키는 브라우저 코드에 넣지 않습니다.
- GEE 서비스 계정 JSON은 Git에 올리지 않습니다.
- Render 환경변수 또는 secret 관리 기능으로만 비밀값을 주입합니다.
- 키가 노출되었거나 교체된 경우 Render와 로컬 환경변수를 함께 갱신합니다.

## 9. 검증 현황

현재까지 다음 검증을 통과했습니다.

- FastAPI 테스트 4개 통과
- Python 문법 검사 통과
- Node API 함수 문법 검사 통과
- Vite production build 성공
- Supabase 연결 확인
- 기본 데이터 건수 확인
- 위성 통계 24,052건씩 확인
- GEE 상태 확인 성공
  - VIIRS: available
  - Hansen: available

## 10. 남은 작업

### 배포 마무리

- Render 실제 배포
- Render `/health`, `/health/db`, `/api/v1/gee-status` 확인
- Vercel `VITE_API_BASE_URL`, `BACKEND_URL` 설정
- Vercel production 배포
- 공개 URL 전체 시나리오 테스트

### 기능 품질 개선

- 드래그형 Swipe 비교 구현
- PDF에 지도 이미지와 시계열 그래프 직접 삽입
- 보고서의 선택 시설명·행정구역명 표시 강화
- 분석 결과에 계산값과 원자료 링크 연결
- LLM API 키 설정 시 외부 AI 해석 연결

## 11. 사용자 검증 시나리오

배포 후 다음 순서로 확인합니다.

```text
1. Vercel 메인 화면 접속
2. 시설명 검색
3. 시설 선택 및 지도 이동
4. VIIRS/Hansen 레이어 확인
5. 시설 분석 패널 확인
6. 14년 시계열 확인
7. 관찰·해석·출처 확인
8. 분석보고서 생성
9. PDF 다운로드
10. /api/project-status에서 전체 상태 확인
```

## 12. 현재 판단

데이터 구축, Supabase 연동, FastAPI, 지도 플랫폼, 위성 통계 적재는 완료된 상태입니다. 현재 프로젝트는 기능 구현 단계에서 배포와 품질 검증 단계로 넘어갔습니다.

핵심 차별점은 시설정보와 위성 변화 데이터를 연결하고, 분석 결과를 관찰과 해석으로 분리해 제공한다는 점입니다.
