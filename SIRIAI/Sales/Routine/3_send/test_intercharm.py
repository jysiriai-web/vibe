"""인터참 템플릿 테스트 발송 — 내 메일함으로 1통.

실제 발송과 동일한 형태로 보낸다:
  multipart/alternative = [text/plain, text/html]
  (기존 gmail.py 는 HTML 단일 파트라 스팸 점수가 올라간다. 여기선 제대로 싣는다.)

  python 3_send/test_intercharm.py            # 미리보기만 (전송 안 함)
  python 3_send/test_intercharm.py --send     # 실제 발송
"""
from __future__ import annotations
import argparse, base64, sys, re
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import gmail  # noqa: E402

TPL_DIR = HERE.parent / "2_compose" / "templates" / "intercharm"
HTML_FILE = TPL_DIR / "발송용_인터참_사후팔로업.html"
TEXT_FILE = TPL_DIR / "발송용_플레인텍스트.txt"

TO = "jysiriai@gmail.com"
SENDER = "SIRIAI 조준용 <jysiriai@gmail.com>"
SUBJECT = "[테스트] {brand} 부스에서 뵀던 SIRIAI입니다"

# 테스트용 치환값 — 실제 발송 때는 시트에서 온다
SLOTS = {"brand": "무드컬러", "name": "김서연", "code": "MOODCOLOR"}


def fill(text: str, slots: dict) -> str:
    for k, v in slots.items():
        text = text.replace("{{%s}}" % k, v)
    left = re.findall(r"\{\{(\w+)\}\}", text)
    if left:
        raise SystemExit(f"치환 안 된 슬롯이 남았습니다: {sorted(set(left))}")
    return text


def strip_note(text: str) -> str:
    """plain-text 파일 상단의 작업 메모(구분선 위)를 잘라낸다."""
    mark = "─" * 10
    i = text.find(mark)
    return text[text.index("\n", i) + 1:].lstrip("\n") if i != -1 else text


def build(html: str, plain: str) -> MIMEMultipart:
    msg = MIMEMultipart("alternative")
    msg["To"] = TO
    msg["From"] = SENDER
    msg["Subject"] = SUBJECT.format(**SLOTS)
    # 순서가 중요하다 — 뒤에 오는 파트를 클라이언트가 선호한다
    msg.attach(MIMEText(plain, "plain", "utf-8"))
    msg.attach(MIMEText(html, "html", "utf-8"))
    return msg


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--send", action="store_true", help="실제 전송 (없으면 미리보기만)")
    args = ap.parse_args()

    html = fill(HTML_FILE.read_text(encoding="utf-8"), SLOTS)
    plain = fill(strip_note(TEXT_FILE.read_text(encoding="utf-8")), SLOTS)
    msg = build(html, plain)

    print(f"받는 사람 : {TO}")
    print(f"보내는 사람: {SENDER}")
    print(f"제목      : {msg['Subject']}")
    print(f"구성      : multipart/alternative (text {len(plain):,}자 + html {len(html):,}자)")

    if not args.send:
        print("\n미리보기만 했습니다. 실제로 보내려면 --send 를 붙이세요.")
        return

    gmail._assert_send_unlocked()          # 하드 락 확인
    svc = gmail.get_service()
    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
    res = svc.users().messages().send(userId="me", body={"raw": raw}).execute()
    print(f"\n전송 완료. message id = {res['id']}")


if __name__ == "__main__":
    main()
