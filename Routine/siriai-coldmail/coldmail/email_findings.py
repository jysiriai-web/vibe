"""이메일 탐색 결과 캐시(사람 검증). 회사/브랜드명 → 확보 정보.

자동 탐색(email_find의 fetch/search) 도입 전까지 검증된 결과를 여기 둔다
(category_overrides 와 동일 패턴). 키는 원문 회사/브랜드명(로드 시 normalize).
confidence: 높음 / 중간 / 낮음 / 미확보.  근거는 note.
"""

FINDINGS = {
    "에이블씨엔씨": {
        "email": "cs@ableshop.net", "confidence": "높음",
        "source": "기존DB(미샤몰)", "note": "미샤·어퓨 운영",
    },
    "앱솔브랩": {
        "email": "mkt@torriden.com", "confidence": "높음",
        "source": "기존DB", "note": "토리든 마케팅",
    },
    "에프앤코": {
        "email": "banila@banila.com", "confidence": "중간",
        "source": "웹(제휴문의)", "note": "바닐라코 제휴 담당 / 발송전용 가능성→회신 시 CS 병행",
    },
    "이앤씨": {
        "email": "enc@enccosmetic.co.kr", "confidence": "중간",
        "source": "웹(공식사이트)", "note": "리들샷 제조사 통합문의 / 영업팀 070-4349-5397",
    },
    "피죤": {
        "email": "", "confidence": "미확보",
        "source": "웹", "note": "[미확보] 공식 이메일 미노출(사이트 TLS오류)·전화/문의폼만",
    },
}
