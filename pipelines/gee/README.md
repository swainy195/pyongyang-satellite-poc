# Earth Engine 파이프라인

1. `gcloud auth application-default login` 또는 서비스 계정 인증을 구성합니다.
2. `.env`에 `GEE_PROJECT_ID`를 설정합니다.
3. 데이터셋 버전과 최신 공개 월을 실행 시점에 확인합니다.
4. 일반 요청 때마다 2012년 이후 전 기간을 재계산하지 말고 연도별 산출물을 배치 처리합니다.
5. 통계 레코드에 `gee_dataset_id`, `processing_version`, `data_status`를 저장합니다.
