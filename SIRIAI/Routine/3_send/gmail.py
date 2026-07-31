"""Gmail API 발송 래퍼 — OAuth 인증 + 단건 전송. (시트용 서비스계정과 별개 인증.)

★ 셋업(1회):
  1. Google Cloud Console > 사용자 인증 정보 > OAuth 클라이언트 ID(데스크톱 앱) 생성
     → JSON 다운로드 → `secrets/gmail_oauth_client.json` 로 저장.
  2. Gmail API 사용 설정(API 및 서비스 > 라이브러리 > Gmail API > 사용).
  3. 처음 send 시 브라우저 동의 1회 → 토큰이 `secrets/gmail_token.json` 에 캐시(gitignore).
  의존 패키지(추가 필요): google-api-python-client, google-auth-oauthlib
    → requirements.txt 에 추가 후 `pip install -r requirements.txt`

이 모듈은 '전송만' 한다(위험 최소). 스로틀·기록·승인게이트는 run.py.
"""
from __future__ import annotations

import base64
from email.mime.text import MIMEText
from pathlib import Path

SCOPES = ["https://www.googleapis.com/auth/gmail.send"]
SECRETS = Path(__file__).resolve().parents[1] / "secrets"
CLIENT_JSON = SECRETS / "gmail_oauth_client.json"
TOKEN_JSON = SECRETS / "gmail_token.json"
UNLOCK_FILE = SECRETS / "SEND_UNLOCKED"  # 이 파일이 있어야만 실제 발송 허용 (없으면 하드 차단)


def _assert_send_unlocked() -> None:
    """발송 하드 락 — secrets/SEND_UNLOCKED 파일이 없으면 전송 자체를 막는다.

    실수/자동/오작동 어떤 경로로도(run.py·테스트·미래 코드 포함) 잠금 해제 없이는 메일이 못 나간다.
    해제: secrets/SEND_UNLOCKED 파일 생성. 다시 잠금: 그 파일 삭제.
    """
    if not UNLOCK_FILE.exists():
        raise RuntimeError(
            "[발송 잠금] 실제 전송이 차단됐습니다(하드 락).\n"
            f"  해제하려면 이 파일을 만드세요: {UNLOCK_FILE}\n"
            "  발송이 끝나면 그 파일을 삭제해 다시 잠그세요.\n"
            "  잠금 해제 없이는 어떤 코드도 메일을 보낼 수 없습니다."
        )


def get_service():
    """OAuth 인증된 Gmail service 반환. 토큰 없으면 브라우저 동의(최초 1회)."""
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import InstalledAppFlow
    from googleapiclient.discovery import build

    creds = None
    if TOKEN_JSON.exists():
        creds = Credentials.from_authorized_user_file(str(TOKEN_JSON), SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not CLIENT_JSON.exists():
                raise FileNotFoundError(
                    f"OAuth 클라이언트 JSON 없음: {CLIENT_JSON}\n  → 셋업 1번 참고(Cloud Console에서 발급).")
            flow = InstalledAppFlow.from_client_secrets_file(str(CLIENT_JSON), SCOPES)
            creds = flow.run_local_server(port=0)
        TOKEN_JSON.write_text(creds.to_json(), encoding="utf-8")
    return build("gmail", "v1", credentials=creds)


def build_message(to: str, subject: str, html: str, sender: str) -> dict:
    """HTML 메일 → Gmail API raw 메시지."""
    msg = MIMEText(html, "html", "utf-8")
    msg["To"] = to
    msg["From"] = sender
    msg["Subject"] = subject
    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
    return {"raw": raw}


def send(service, to: str, subject: str, html: str, sender: str) -> str:
    """단건 전송. 성공 시 메시지 id 반환, 실패 시 예외."""
    _assert_send_unlocked()  # 하드 락: secrets/SEND_UNLOCKED 없으면 여기서 차단
    body = build_message(to, subject, html, sender)
    sent = service.users().messages().send(userId="me", body=body).execute()
    return sent.get("id", "")


if __name__ == "__main__":
    # 셋업 확인용 — 자기 자신에게 테스트 1통(OAuth 동의 트리거).
    import sys
    me = "jysiriai@gmail.com"
    svc = get_service()
    mid = send(svc, me, "[테스트] SIRIAI 발송 셋업 확인",
               "<p>OAuth·전송 정상. SIRIAI 발송 파이프라인.</p><p>수신거부: 무료 회신.</p>", me)
    print("전송 OK, id:", mid, file=sys.stderr)
