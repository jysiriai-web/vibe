# profiles/ — 소싱 타깃 프로필 (갈아끼우는 config)

0_intake의 "무엇을 찾을지"를 **프로필 1장**으로 분리했다. 같은 기계장치(소싱 엔진 + run.py)에 프로필만 바꿔 끼우면 다른 타깃·다른 시트로 돈다.

```
[프로필 .json]  ──►  source_brands.workflow.js (니치 웹서치 → 중복제거 → QA)
  무엇을/어디에         ──►  candidates_*.csv  ──►  run.py --file --tab <target_tab>  ──►  시트
                                                          (중복제거 후 append)
```

## 프로필 필드
| 키 | 뜻 |
|---|---|
| `name` / `target` | 이 프로필이 찾는 대상 설명 |
| `target_tab` | 결과를 넣을 시트 탭 (예: `6월`, `인터참`) |
| `include` / `exclude` | 포함·제외 기준(ICP) — 에이전트 프롬프트로 들어감 |
| `accuracy` | 정확성 규칙(실재·출처·혼동방지) |
| `niches` | `[{key,label}]` — 니치별 병렬 웹서치 단위 |
| `perNiche` | 니치당 찾을 개수(예: "6~12") |
| `skipList` | 이미 확보돼 재발굴 제외할 이름들 |
| `sourcing_mode` | (선택) `niche-search`(기본) / `directory-scrape`(인터참 등) |

## 쓰는 법
**A. 니치 웹서치 소싱** (일반 케이스, 예: `siriai_kbeauty.json`)
1. 프로필 편집/복제.
2. Claude에게: "`source_brands.workflow.js`를 이 프로필로 돌려줘" → 내가 프로필을 읽어 워크플로우 `args`로 넘김.
3. 결과 `final[]` → `candidates_YYMMDD.csv` 저장.
4. `python run.py --file candidates_YYMMDD.csv --tab <target_tab>` (dry-run) → `--apply`로 시트 투입.

**B. 직접 CSV** (디렉터리 스크랩 등, 예: `intercharm.json`)
- 어디서든 `브랜드명,카테고리,인스타,근거` CSV만 만들면 → `run.py --file <csv> --tab <target_tab>`로 동일 투입. (니치 엔진 안 거쳐도 됨.)

## 다른 사람이 쓰려면
1. 자기 프로필 1장 작성(자기 ICP·시트탭).
2. `_shared/config.py`의 `SHEET_ID` + `secrets/service_account.json`(자기 구글시트·키)로 교체.
3. 위 A/B 그대로. → 자기가 원하는 타깃을 자기 시트에 모음.

> 도메인(무엇을)은 프로필에, 기계장치(어떻게)는 `source_brands.workflow.js`·`run.py`에. 둘이 분리돼 있어 프로필만 갈아끼우면 재사용된다.
