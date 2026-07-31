# Gmail 발송 셋업 가이드 (1회, ~10분)

> 목표: `jysiriai@gmail.com`으로 코드가 메일을 보낼 수 있게 OAuth 키 1개 발급.
> 시트용 서비스계정과 **별개 인증**(서비스계정은 메일을 못 보냄). 끝나면 `gmail.py`가 전송 가능.

## 0. 준비
- 발송 계정 `jysiriai@gmail.com`으로 로그인된 브라우저.
- Google Cloud Console: https://console.cloud.google.com

## 1. 프로젝트 선택
- 상단 프로젝트 드롭다운 → 시트 만들 때 쓴 프로젝트(`certain-reducer-498909-q3`) **재사용 가능**. 없으면 새로 만들어도 됨.

## 2. Gmail API 켜기
- 좌측 메뉴 **API 및 서비스 → 라이브러리** → `Gmail API` 검색 → **사용** 클릭.

## 3. OAuth 동의 화면 (최초 1회만)
- **API 및 서비스 → OAuth 동의 화면**
  - User Type: **외부** → 만들기
  - 앱 이름: `SIRIAI 발송` / 지원 이메일·개발자 이메일: `jysiriai@gmail.com`
  - 범위(Scopes): 그냥 저장(다음 단계서 코드가 지정함)
  - **테스트 사용자**에 `jysiriai@gmail.com` **추가** ← 이거 빠지면 동의 시 막힘
  - 저장. (게시 안 해도 됨 — 테스트 모드로 본인 계정은 동작)

## 4. OAuth 클라이언트 ID 발급 ★핵심
- **API 및 서비스 → 사용자 인증 정보 → + 사용자 인증 정보 만들기 → OAuth 클라이언트 ID**
  - 애플리케이션 유형: **데스크톱 앱**
  - 이름: `SIRIAI send` → 만들기
- 생성되면 **JSON 다운로드** → 파일명을 `gmail_oauth_client.json` 으로 바꿔
  → `Routine/secrets/gmail_oauth_client.json` 에 저장. (secrets/는 gitignore라 안전)

## 5. 패키지 설치 (한 줄)
```powershell
.\.venv\Scripts\python.exe -m pip install google-api-python-client google-auth-oauthlib
```
*(requirements.txt 에도 추가해둘게.)*

## 6. 첫 인증 + 테스트 발송 (자기 자신에게 1통)
```powershell
.\.venv\Scripts\python.exe 3_send\gmail.py
```
- 브라우저가 열림 → `jysiriai@gmail.com` 선택 → "앱이 확인되지 않음" 나오면 **고급 → 안전하지 않음으로 이동**(본인 앱이라 정상) → 허용.
- 성공하면 `jysiriai@gmail.com` 받은편지함에 **[테스트] SIRIAI 발송 셋업 확인** 1통 도착.
- 토큰이 `secrets/gmail_token.json` 에 자동 저장 → **다음부턴 동의 없이 발송**.

## 끝
이거 되면 발송 파이프라인 전체가 연결됨. 막히는 단계 있으면 그 화면 캡처해서 보여주면 바로 잡아줄게.

---
**보안:** `secrets/` 안의 두 JSON(서비스계정·OAuth)은 절대 깃에 안 올라감(gitignore 확인됨). 유출 시 Cloud Console에서 해당 키 폐기하면 됨.
