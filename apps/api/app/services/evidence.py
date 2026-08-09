from datetime import date


def build_evidence_package(admin_code: str, start: date, end: date) -> dict:
    """DB 조회 결과를 LLM에 전달할 제한된 근거 패키지로 변환하는 자리입니다."""
    return {
        "analysisTarget": {
            "adminCode": admin_code,
            "periodStart": start.isoformat(),
            "periodEnd": end.isoformat(),
        },
        "satelliteObservations": [],
        "facilities": [],
        "documents": [],
        "rules": [
            "제공되지 않은 수치를 생성하지 않는다.",
            "상관관계를 인과관계로 표현하지 않는다.",
            "모든 주요 주장에 evidenceId를 붙인다.",
        ],
    }
