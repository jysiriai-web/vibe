"""4_track Gmail 읽기 전용 클라이언트 — 회신 감지용. (발송용 gmail.py와 별개)

★ 스코프 = gmail.readonly → **메일을 보낼 수 없음**(읽기만). 발송 위험 0.
  토큰 = secrets/gmail_token_readonly.json (발송 토큰과 별도). 최초 1회 브라우저 동의(읽기 전용).
  OAuth 클라이언트는 발송용과 동일(gmail_oauth_client.json) 재사용.

LLM 안 씀. messages.list 쿼리로 "그 주소에서 온 메일(=회신)" 유무만 본다.
"""
from __future__ import annotations

from pathlib import Path

SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]
SECRETS = Path(__file__).resolve().parents[1] / "secrets"
CLIENT_JSON = SECRETS / "gmail_oauth_client.json"
TOKEN_JSON = SECRETS / "gmail_token_readonly.json"


def get_service():
    """읽기 전용 Gmail service. 토큰 없으면 브라우저 동의(최초 1회, 읽기 전용)."""
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
                    f"OAuth 클라이언트 JSON 없음: {CLIENT_JSON}\n  → 3_send/SETUP_gmail.md 4번 참고.")
            flow = InstalledAppFlow.from_client_secrets_file(str(CLIENT_JSON), SCOPES)
            creds = flow.run_local_server(port=0)
        TOKEN_JSON.write_text(creds.to_json(), encoding="utf-8")
    return build("gmail", "v1", credentials=creds)


def has_reply(service, email: str, after_yyyy_mm_dd: str | None = None) -> tuple[bool, str]:
    """`email` 주소에서 온 메일(=회신)이 있으면 (True, 'YYYY-MM-DD'), 없으면 (False, '').

    after_yyyy_mm_dd: 'YYYY-MM-DD'(발송일자). 그 이후 메일만 본다(발송 전 과거 메일 오탐 방지).
    """
    import datetime as _dt

    email = (email or "").strip()
    if not email:
        return False, ""
    q = f"from:{email}"
    if after_yyyy_mm_dd:
        q += f" after:{after_yyyy_mm_dd.replace('-', '/')}"  # gmail 검색 날짜 = YYYY/MM/DD
    resp = service.users().messages().list(userId="me", q=q, maxResults=1).execute()
    msgs = resp.get("messages", [])
    if not msgs:
        return False, ""
    meta = service.users().messages().get(
        userId="me", id=msgs[0]["id"], format="metadata", metadataHeaders=["Date"]).execute()
    ts = int(meta.get("internalDate", "0")) / 1000
    date_str = _dt.datetime.fromtimestamp(ts).strftime("%Y-%m-%d") if ts else ""
    return True, date_str
