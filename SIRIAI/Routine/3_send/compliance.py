"""정보통신망법 발송 가드 — 전송 전 차단(되돌릴 수 없는 단계라 보수적).

이 모듈은 LLM·발송 없음. 순수 규칙 검증:
  ① 야간 금지: 21:00~익일 08:00(KST) 전송 금지(별도 사전동의 없으면).
  ② 표기 의무: 본문에 발신자 정보 + 무료 수신거부 수단 존재 확인.
  ③ [광고] 접두: 토글. 켜면 제목 맨 앞에 (광고) 필요.
근거: 정보통신망법 제50조 (2026-06 기준). 법률자문 아님 — 최종 문구는 검토 권장.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

KST = timezone(timedelta(hours=9))
SEND_START_H, SEND_END_H = 8, 21          # 08:00 <= 전송 허용 < 21:00
AD_PREFIX = "(광고)"                       # 제목 맨 앞 표기(토글 시)

# 표기 의무 검증용 마커 — 템플릿/본문에 이 의미가 들어있어야 함
SENDER_MARKERS = ("SIRIAI", "문의", "연락처")        # 발신자 정보(택1 이상)
UNSUB_MARKERS = ("수신거부", "수신 거부", "unsubscribe")  # 수신거부 수단
FREE_MARKERS = ("무료",)                              # '무료' 명시


def now_kst() -> datetime:
    return datetime.now(KST)


def within_send_window(at: datetime | None = None) -> bool:
    """KST 08:00~21:00 사이면 True (야간 금지)."""
    h = (at or now_kst()).hour
    return SEND_START_H <= h < SEND_END_H


def next_window_start(at: datetime | None = None) -> datetime:
    """다음 전송 가능 시각(오늘 08시 전이면 오늘 08시, 21시 후면 내일 08시)."""
    t = at or now_kst()
    today8 = t.replace(hour=SEND_START_H, minute=0, second=0, microsecond=0)
    if t < today8:
        return today8
    return today8 + timedelta(days=1)


# 수신거부 표기는 사용자 결정으로 비활성: 저물량·비스팸·1000통+ 무사고.
# 필요해지면 REQUIRE_UNSUB=True 로 즉시 재적용(템플릿 푸터에 무료 수신거부 한 줄만 추가).
REQUIRE_UNSUB = False


def check_template(html: str, subject: str, ad_prefix: bool) -> list[str]:
    """발송 전 본문/제목 표기 점검. 위반 사유 목록 반환(빈 리스트=통과)."""
    issues = []
    if not any(m in html for m in SENDER_MARKERS):
        issues.append("발신자 정보(SIRIAI 명칭·연락처)가 본문에 없음")
    if REQUIRE_UNSUB:
        if not any(m in html for m in UNSUB_MARKERS):
            issues.append("수신거부 수단이 본문에 없음")
        elif not any(m in html for m in FREE_MARKERS):
            issues.append("수신거부에 '무료' 명시 없음")
    if ad_prefix and not subject.strip().startswith(AD_PREFIX):
        issues.append(f"[광고] 토글 ON 인데 제목이 {AD_PREFIX} 로 시작 안 함")
    return issues


def guard(html_sample: str, subject_sample: str, ad_prefix: bool) -> None:
    """전송 직전 종합 가드. 위반/야간이면 RuntimeError 로 중단."""
    if not within_send_window():
        raise RuntimeError(
            f"야간 전송 금지(21~08시). 다음 가능: {next_window_start():%Y-%m-%d %H:%M} KST")
    issues = check_template(html_sample, subject_sample, ad_prefix)
    if issues:
        raise RuntimeError("표기 의무 위반 — 전송 중단:\n  - " + "\n  - ".join(issues))


def apply_ad_prefix(subject: str, enabled: bool) -> str:
    """토글 ON 이고 아직 없으면 제목 맨 앞에 (광고) 부착."""
    if enabled and not subject.strip().startswith(AD_PREFIX):
        return f"{AD_PREFIX} {subject}"
    return subject


if __name__ == "__main__":
    print("KST now:", now_kst().strftime("%Y-%m-%d %H:%M"))
    print("전송 가능 시간대?", within_send_window())
    print("다음 가능:", next_window_start().strftime("%Y-%m-%d %H:%M"))
    demo = "<p>안녕하세요 SIRIAI 입니다. 문의: jysiriai@gmail.com</p><p>수신거부는 본 메일에 무료로 회신주세요.</p>"
    print("표기 점검(접두 OFF):", check_template(demo, "제안드립니다", False) or "통과")
    print("표기 점검(접두 ON):", check_template(demo, "제안드립니다", True))
