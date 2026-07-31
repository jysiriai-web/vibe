# 6_proposal — 제안 대시보드 (⬜ 설계)

> 상태: 설계 확정 단계. 발송(3_send) 가동 후 회신이 쌓이면 구현 착수.

---

## 1. 목적

`발송단계=관심` 또는 `영업단계=미팅` 인 브랜드에게 보낼 맞춤 제안 자료(단일 HTML 파일)를 자동 생성한다. 브랜드명·홈페이지·카테고리 3개를 config에 주입하면 기존 `_SIRIAI_TEMPLATE/index.html` 기반으로 브랜드별 제안 대시보드가 만들어진다. 인플루언서 후보 큐레이션, 과거 캠페인 케이스, 예상 효과를 담아 영업 미팅 직전 링크로 전달하는 것이 목적이다.

---

## 2. 데이터 계약

### 2-1. 입력 — 시트에서 읽는 열

| 열 | 위치(헤더명) | 조건 | 비고 |
|---|---|---|---|
| 브랜드명 | C열 `브랜드명` | 읽기 전용 | 파일명·config에 그대로 사용 |
| 연락처(이메일) | D열 `연락처` | 읽기 전용 | 제안 발송 수신자 참고 |
| 구분(카테고리) | B열 `구분` | 읽기 전용 | 인플루언서 큐레이션 필터 기준 |
| 메일주의 | 안전장치열 `메일주의` | 읽기 전용 | 비어 있으면 제한 없음 |
| 발송단계 | 추가열 `발송단계` | **트리거 조건** | 값이 `관심` 또는 `미팅`인 행만 처리 |
| 영업단계 | 추가열 `영업단계` | 보조 조건 | `관심`·`미팅`·`리드` 중 하나 |
| 제안생성일 | 추가열 `제안생성일` | 이중처리 방지용 | 비어 있는 행만 신규 생성 대상 |
| 제안URL | 추가열 `제안URL` | 출력 | 생성된 대시보드 링크 기록 |

> `발송단계`·`영업단계`·`제안생성일`·`제안URL` 4열은 6월 탭에 **append**로 추가한다. 기존 열 순서를 바꾸지 않는다(수식 자동추종).

### 2-2. 출력 — 시트에 쓰는 열

| 열 | 헤더명 | 쓰는 값 | 조건 |
|---|---|---|---|
| 제안생성일 | `제안생성일` | `YYYY-MM-DD` | 대시보드 HTML 파일 생성 직후 |
| 제안URL | `제안URL` | Vercel 배포 URL 또는 로컬 파일 경로 | 배포 완료 후 업데이트 (확정 시에만) |

### 2-3. 파일 시스템 출력

| 경로 | 내용 |
|---|---|
| `6_proposal/output/{브랜드}.html` | 브랜드별 제안 대시보드 HTML (단일 파일) |
| `6_proposal/output/{브랜드}/config.json` | 생성에 사용한 config 스냅샷 (재현·감사용) |
| `6_proposal/output/{브랜드}/influencers.csv` | 큐레이션에 사용한 인플루언서 정규화본 |

> `output/` 하위는 `.gitignore` 처리 권장(브랜드별 실데이터 포함). 단, `config.json`은 내부용으로 보관 가능.

---

## 3. 메커니즘

### 3-1. 전체 흐름

```
run.py
  ├─ 1. 시트 읽기 → 발송단계 in (관심, 미팅) AND 제안생성일 == "" 인 행 추출
  ├─ 2. 각 브랜드별로:
  │    ├─ 2a. brand_config 빌드
  │    │    ├─ 브랜드명·카테고리: 시트에서 직접
  │    │    ├─ 홈페이지 URL: config.json 수동 기입 또는 --url 인자
  │    │    ├─ 악센트 색·커버 이미지: 홈페이지 OG 태그 fetch (WebFetch)
  │    │    └─ 인플루언서 큐레이션: 틈결 마스터 시트 또는 로컬 CSV에서 카테고리 필터
  │    ├─ 2b. _SIRIAI_TEMPLATE/index.html 복사 → BRAND config 블록 치환
  │    ├─ 2c. output/{브랜드}.html 저장
  │    └─ 2d. config.json 스냅샷 저장
  └─ 3. 시트 batch_update: 처리한 행의 제안생성일 기록
```

### 3-2. brand_config 빌드 상세

**홈페이지 → 브랜드 킷**
- `WebFetch`로 홈페이지 HTML 읽기 → `<meta property="og:image">` 추출(커버 이미지)
- 대표색 추출: OG 이미지에서 팔레트 샘플링 → 저채도 보정 1색(악센트). 자동화 어려우면 `config.json`의 `accent` 필드에 수동 기입 허용
- 슬로건: `<meta name="description">` 또는 `<title>` 첫 문장 가져오기

**인플루언서 큐레이션**
- 원본: 내부 틈결 마스터 시트(1_collector와 같은 스프레드시트의 별도 탭) 또는 `_shared/influencer_pool.csv`
- 필터 기준: `구분(카테고리)` 일치 → ER·팔로워 내림차순 정렬 → 상위 12~16명 슬라이스
- featured(표지 강조 4명): ER + 팔로워 균형 점수 상위
- 단가(`cost`)는 기본값 `"협의"` 처리 (공개본 마스킹)

**LLM 사용처**
- 사용처 1: 홈페이지 raw_text 기반으로 `copy.tagline`·`copy.coverDesc` 2줄 초안 생성 (Claude Sonnet). 생성 시 반드시 raw_text에서 근거 추출(환각 차단). `메일주의`열 경고가 있으면 프롬프트에 명시.
- 사용처 2: `comparison.ours`(경쟁사 대비 핵심 차별점) 1줄. 근거 = 홈페이지 텍스트 한정.
- LLM 결과는 config.json에 저장해 사람이 검토 후 수정 가능한 구조로.
- **LLM 없이도 작동**: `--no-llm` 플래그 시 홈페이지 메타 텍스트 그대로 사용.

**템플릿 주입**
- `_SIRIAI_TEMPLATE/index.html`의 `const BRAND = {...}` config 블록만 교체 (정규식 또는 JS comment 구분자 `// [브랜드 입력]` ~ `// [/브랜드 입력]` 사이 slice 치환)
- `[SIRIAI 공통]` 블록(whyUs·process·closing.contact)은 **절대 건드리지 않음**
- 치환 후 미치환 슬롯(`[브랜드 입력]` 잔재)이 있으면 에러로 차단

### 3-3. 인터페이스 (모듈 간 코드 의존 0)

| 연결 방향 | 수단 | 내용 |
|---|---|---|
| 5_reply → 6_proposal | 시트 `발송단계` 열 | 값이 `관심`/`미팅`이 되면 6_proposal 트리거 |
| 6_proposal → 시트 | 시트 `제안생성일`·`제안URL` 열 | 생성 완료 기록 |
| 6_proposal → 7_deal | 시트 `제안URL` 열 | 7_deal이 이 URL 읽어 후속 추적 |

---

## 4. 상태 전이

이 모듈은 발송단계를 직접 변경하지 않는다. 읽기 전용으로 트리거 감지, 쓰기는 `제안생성일`·`제안URL` 2개 열만.

```
발송단계: 관심 또는 미팅
         │
         ▼  (6_proposal 처리)
제안생성일: (비어있음) → YYYY-MM-DD 기록
제안URL:   (비어있음) → 배포 URL 또는 로컬 경로 기록
         │
         ▼  (사람이 링크 전달)
발송단계: 미팅  (변경 주체: 사람, 또는 8_followup)
```

**영업단계 흐름 (참고)**

```
관심 → 리드 → 미팅 → 계약 → 성사
                  ↑
        6_proposal 생성 타이밍 (관심 또는 미팅 진입 시)
```

---

## 5. 안전·주의

### 5-1. 되돌리기 / dry-run 원칙
- **모든 시트 쓰기 전 백업**: `_shared/backup.py`로 대상 탭 전체 TSV 스냅샷 → `6_proposal/backups/` 저장
- **기본 dry-run**: `--apply` 없이 실행하면 HTML 파일 생성만 하고 시트는 쓰지 않음. 생성된 HTML 브라우저 확인 후 `--apply`로 시트 기록
- HTML 파일 삭제는 단순 `rm` 이므로 언제든 되돌릴 수 있음

### 5-2. 이중처리 방지
- **멱등 조건**: `제안생성일`이 이미 채워진 행은 `--force` 없이 재처리 안 함
- 배치 실행 시 처리 완료 행을 즉시 기록해 중단 후 재실행해도 동일 브랜드 중복 생성 없음
- 파일도 동일 브랜드명이면 덮어쓰기 전 경고 + `--overwrite` 명시 요구

### 5-3. 사람 승인 게이트
- Vercel 배포는 **확정 후 사람이 직접** (`[[feedback_deployment]]` 원칙 준수). `run.py`는 로컬 HTML만 생성
- 링크를 브랜드 담당자에게 전달하는 행위 역시 자동화하지 않음 (3_send와 동일)
- LLM이 생성한 tagline·coverDesc는 `config.json`에 저장해 사람이 검토·수정 후 `--apply`

### 5-4. 메일주의 안전장치
- 시트 `메일주의` 열의 경고가 있는 브랜드는 대시보드 copy(tagline·coverDesc)에 해당 키워드 포함 여부를 빌드 후 검사 (`caution_check()`)
- 경고 키워드 탐지 시: 빌드 중단 + 경고 출력 + `output/caution_review.tsv`에 기록. `--force-caution`으로만 강제 통과 가능
- 예: `메일주의=생리대·페미닌케어 절대 언급 금지` → 해당 단어가 HTML 내 포함되면 게이트에서 차단

### 5-5. 브랜드 자산 저작권
- 홈페이지에서 가져오는 OG 이미지·배너는 해당 브랜드 소유 자산 — 제안 목적 내부 사용에 해당하므로 수용 가능하나, 공개 URL 배포 시 사용 범위 주의
- 인플루언서 프로필 사진은 인스타 차단·타인 저작물이므로 이니셜 아바타 유지 (`_SIRIAI_TEMPLATE` 기존 방침 그대로)

---

## 6. 구현 메모

### 6-1. 예상 파일 구조

```
Routine/6_proposal/
├── README.md              ← 이 파일
├── run.py                 진입점
│    --tab 6월             처리할 시트 탭 (기본 "6월")
│    --brand <브랜드명>     단건 처리 (배치 아닌 1건)
│    --dry-run             기본값 True (시트 미기록)
│    --apply               실제 시트 쓰기 활성화
│    --no-llm              LLM 없이 메타 텍스트 그대로
│    --overwrite           이미 생성된 HTML 덮어쓰기 허용
│    --force-caution       메일주의 게이트 강제 통과
├── builder.py             brand_config 빌드 + HTML 치환 로직
├── influencer.py          인플루언서 풀 → 카테고리 필터·정렬·featured 선정
├── llm_copy.py            LLM 기반 tagline·coverDesc 생성 (Sonnet)
├── caution.py             메일주의 키워드 게이트
├── config_schema.py       brand_config 스키마 (필수 키 검증)
├── output/                ← .gitignore 권장
│   └── {브랜드}/
│       ├── {브랜드}.html  완성된 제안 대시보드
│       ├── config.json    빌드에 쓴 BRAND config 스냅샷
│       └── influencers.csv 큐레이션 정규화본
└── backups/               시트 쓰기 전 TSV 스냅샷
```

### 6-2. 의존

| 의존 | 종류 | 비고 |
|---|---|---|
| `../_shared/sheets.py` | 공유 | 시트 읽기·쓰기 |
| `../_shared/backup.py` | 공유 | 쓰기 전 TSV 백업 |
| `../_shared/config.py` | 공유 | SHEET_ID, 서비스계정 경로 |
| `C:\Users\whwns\Desktop\VIBE\Dashboard\_SIRIAI_TEMPLATE\index.html` | 로컬 절대경로 | 템플릿 원본. 경로는 `config.py` 또는 `--template` 인자로 주입 |
| `gspread` | pip | `requirements.txt` 기존 의존 |
| `anthropic` | pip | LLM copy 생성용 (Sonnet). `--no-llm` 시 불필요 |
| `httpx` 또는 `requests` | pip | 홈페이지 fetch (OG 태그 추출) |

### 6-3. _shared/config.py 추가 필요 항목

```python
# 6_proposal 전용
PROPOSAL_TEMPLATE = Path("C:/Users/whwns/Desktop/VIBE/Dashboard/_SIRIAI_TEMPLATE/index.html")
INFLUENCER_POOL_TAB = "틈결"  # 또는 로컬 CSV 경로 — 미정
```

### 6-4. 미정 / 결정 필요 항목

| # | 항목 | 옵션 A | 옵션 B | 결정 기준 |
|---|---|---|---|---|
| 1 | **인플루언서 풀 원본** | 스프레드시트 내 별도 탭(틈결) | `_shared/influencer_pool.csv` 로컬 파일 | 시트가 자주 업데이트되면 A, 안정적이면 B |
| 2 | **OG 이미지 → 악센트 색 자동 추출** | `colorthief` 라이브러리 사용 | 수동 기입(config.json `accent` 채움) | 초기는 B(수동)로 시작, 반복 잦으면 A 도입 |
| 3 | **LLM copy 생성 시점** | 빌드 시 실시간 | 별도 `--gen-copy` 단계 분리 | 분리 권장(사람 검토 게이트 명확) |
| 4 | **배포 트리거** | `run.py --deploy`로 Vercel CLI 호출 | 사람이 수동 배포 | `[[feedback_deployment]]` 원칙상 B |
| 5 | **`발송단계=관심` 자동 감지 주기** | cron 루틴(`/schedule`) | 사람이 직접 `run.py --tab 6월` 실행 | 4_reply-tracker 완성 후 A 고려 |
| 6 | **시트 추가 열 위치** | D열 오른쪽 직후 삽입 | 열 맨 끝 append | 기존 수식 충돌 최소화 위해 B(맨 끝) 권장 |

### 6-5. 구현 선행 조건

1. `3_send` 가동 후 `발송단계=관심` 행이 실제로 쌓여야 의미 있음
2. 6월 탭에 `발송단계`·`영업단계`·`제안생성일`·`제안URL` 4열 추가 (1_collector와 동일한 방식으로 열 삽입 스크립트로 한 번에)
3. 인플루언서 풀(틈결) 탭 정규화 완료 (컬럼: name·handle·followers·views·er·category·cost)
4. `_SIRIAI_TEMPLATE/index.html`의 `[브랜드 입력]` 구분자 형식 확정 (현재 주석 기반 — 파서 작성 전 수동 확인 필요)