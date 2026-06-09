# Routine — SIRIAI 자동화 루틴 모음

이 폴더(`Routine/`)는 **매일 밤 자동 실행될 자동화 루틴(routine)들의 코드**를 담는 컨테이너다.
각 루틴은 Claude의 "루틴(scheduled remote agent)"으로 등록되어 **원격(클라우드)에서 cron 실행**된다 — PC가 꺼져 있어도 동작.
모든 루틴의 출력물은 **구글시트**이고, 사용자는 시트만 확인하면 된다(별도 대시보드 없음).

---

## 1. 현재 구조

```
Routine/
├── .claude/            Claude Code 프로젝트 설정 (자동 생성, 건드릴 일 없음)
├── README.md           ← 이 문서 (전체 구조·규칙)
└── siriai-coldmail/    [루틴①] 이메일 확보 — 회사/브랜드명 → 분류·제조사정리·이메일확보
```

지금은 **루틴이 1개**(`siriai-coldmail`)다.

## 2. 루틴 하나의 내부 구조 (`siriai-coldmail` 기준)

```
siriai-coldmail/
├── run.cmd / run.py        실행 진입점 (CLI). 예: .\run.cmd --inspect --tab 7월
├── coldmail/               로직 패키지 (기능별 모듈)
│   ├── sheets.py           시트 연결·읽기·배치쓰기·삭제      ┐
│   ├── config.py           시트ID·열매핑·경로              ├ ★공유 후보
│   ├── normalize.py        이름 정규화(괄호·법인격·중복키)   │  (다른 루틴도 그대로 씀)
│   ├── backup.py           쓰기 전 CSV 백업                ┘
│   ├── category_overrides.py  구분 분류 보정사전           ┐
│   ├── manufacturer.py     제조사 판별(키워드+큐레이션)      ├ 이 루틴 고유 로직
│   ├── email_find.py       이메일 탐색 헬퍼                │
│   └── email_findings.py   이메일 검증 캐시                ┘
├── secrets/                서비스계정 키 (git 제외)
├── .venv/                  파이썬 환경 (git 제외)
├── backups/  reports/      실행 산출물 (git 제외, 버려도 됨)
├── PRD.md  README.md       설계 문서
└── requirements.txt        의존성
```

- **git에 올라가는 것:** 코드(`run.py`, `coldmail/`), 문서, 설정 예시(`.env.example`)
- **git 제외(`.gitignore`):** `secrets/`(키), `.venv/`, `backups/`, `reports/`, `_*.py`(스크래치)

## 3. 앞으로 — 새 루틴 추가 규칙

새 루틴은 `Routine/` 아래 **자기 폴더**로 추가한다. 한 폴더 = 한 루틴 = 하나의 Claude 루틴(스케줄).

```
Routine/
├── _shared/            ★공유 코드 (시트접근·인증·정규화·백업) — 모든 루틴이 import
├── secrets/            서비스계정 키 1개 (공유)
├── .venv/  requirements.txt   공유 환경
├── siriai-coldmail/    [루틴①] 이메일 확보
├── mailsuite-sync/     [루틴②] 발송·열람·클릭 추적 → 시트 기록   (예정)
└── reply-drafter/      [루틴③] 회신 감지 → 1차 회신 초안 작성     (예정)
```

### 공유 vs 개별 (핵심 원칙)
- **공유(한 번만 둠):** 서비스계정 키, 시트ID·열매핑, 시트접근·정규화·백업 코드 → `_shared/`
  - 이유: 키를 루틴마다 복사하면 위험하고, 시트 설정이 흩어지면 관리가 깨진다.
- **개별(루틴마다):** 그 루틴 고유 로직 + `run.py`(진입점) + 그 루틴의 `reports/`·`backups/`

### 파이프라인 (큰 그림)
```
확보(coldmail) → 발송(Mailsuite) → 추적기록(mailsuite-sync) → 회신감지·초안(reply-drafter)
```
네 루틴 모두 **같은 구글시트를 데이터 백본**으로 공유한다. 시트의 정형 열(발송·열람·클릭·회신·성사)이 루틴 간 연결고리.

## 4. 로컬 폴더 ↔ Claude 루틴(스케줄) 관계
- **이 폴더 = 코드(로직)**. 손으로 `run.cmd`로 돌려 테스트한다.
- **Claude 루틴 = 스케줄러**. 검증된 로직을 매일 밤 원격 실행하도록 `/schedule`로 등록한다.
- 등록 시 필요한 것: ① 서비스계정 키를 루틴 환경에 제공 ② "그달 탭 새 행 처리" 프롬프트 1개.

## 5. 권장 다음 단계
1. **(지금 1개라 선택)** 공유 코드를 `_shared/`로 추출 — 루틴②를 만들 때 해도 되고, 지금 미리 해도 됨.
2. 루틴②(`mailsuite-sync`)부터 `_shared/` 위에 얹어 추가.
3. 각 루틴이 검증되면 `/schedule`로 야간 자동화.
