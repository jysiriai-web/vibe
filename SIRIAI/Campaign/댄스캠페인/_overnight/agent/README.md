# 스캔 에이전트 (무인 워커) — 프로토타입

`bat`·터미널 없이 대표님 PC 백그라운드에서 틱톡 스캔이 돌게 하는 얇은 에이전트입니다.
추천 아키텍처(`_overnight/01_추천_아키텍처.md`)의 **단계 1 뼈대**를 프로토타입으로 구현했습니다.

동작 한 줄: **버스(로컬 큐 또는 시트)에서 '스캔 요청'을 폴링 → 기존 스캔 두뇌를 그대로 호출 → 결과를 마스터 시트에 되쓰기 → 저녁 시간창 예약(무인) + 온디맨드(감독).**

> ⚠️ **기존 라이브 코드는 한 줄도 안 고칩니다.** 이 폴더의 새 파일들이 `src/` 함수를 `import` 해서 재사용만 합니다.
> ⚠️ **스캔 전용.** 돈(집행·리필)은 이 에이전트가 다루지 않습니다(추천 아키텍처 3단계, 별도·가장 신중하게).

---

## 1. 기존 코드를 어떻게 재사용하나 (안 고치고)

에이전트는 스캔 로직을 새로 짜지 않습니다. `src/` 의 진입 함수를 그대로 호출합니다.

| 재사용 함수 (수정 안 함) | 파일 | 하는 일 |
|---|---|---|
| `runContentScan(campaign, hooks)` | `src/content-core.js` | 업로드/전체/조회수(perf) 스캔. 실제 크롬 창(`headless:false`)·집 IP·순차·jitter·연속3회 막힘감지 전부 그대로. 결과를 `pushCellsToSheet` 로 **마스터 시트에 직접 되쓴다**(콘텐츠17·음원19·해시21·성과27~30). |
| `scanOneProfile(campaign, {row,handle})` | `src/content-core.js` | 계정 1개 프로필만 빠르게 확인. |
| `judgeOneLink(campaign, {row,handle,link})` | `src/content-core.js` | 프로필이 막힐 때 영상 링크 1장만 열어 판정. |
| `getCampaign` / `listCampaigns` | `src/campaigns.js` | `campaigns.json` 기반 캠페인. |

에이전트가 넘기는 콜백(`onWarmup`·`waitForGo`·`onProgress`·`shouldPause`·`onBlocked`)은
**지금 `src/server.js` 의 `/api/content-scan` 이 넘기던 것과 동일한 계약**입니다. 즉 상태기계(인증 게이트·막힘 게이트)를
서버 메모리 대신 **버스 셀/상태 파일로 미러링**만 바꿨습니다.

**중요:** 스캔 '결과 데이터'는 이미 `runContentScan` 이 마스터 시트에 씁니다. 그래서 클라우드 대시보드는
평소처럼 `/api/data` 만 읽으면 최신치가 보입니다. 이 에이전트의 버스가 새로 나르는 것은
**(a) 스캔 요청 (b) 진행/인증/막힘 상태 (c) 결과 요약·하트비트** 3가지뿐입니다.

돈 안전도 그대로입니다. 워커는 `GARDEN_CLOUD`/`VERCEL` **없이** 도는 로컬 프로세스라
`src/server.js:29` 의 `CLOUD ? null : key` 에서 CLOUD=false 로 동작하지만, **이 프로토타입은 스캔만** 하므로
SMM 키를 아예 안 씁니다.

---

## 2. 파일 구성

```
_overnight/agent/
├─ worker.js              ← 메인 무인 워커: 단일락·폴링루프·저녁예약·하트비트·상태기계 어댑터
├─ worker-bus.js          ← 신호버스 얇은 추상화 (local 파일큐 / sheet 두 드라이버, 스왑 가능)
├─ runner.js              ← job → 기존 스캔 함수 디스패치 (재사용 지점)
├─ control-server.js      ← 127.0.0.1 상태·온디맨드 서버 (배지 + 스캔요청 + 감독 게이트)
├─ config.js              ← 설정 로더 (agent.config.json / 환경변수 / 기본값)
├─ enqueue.js             ← 스캔요청 큐잉 CLI (테스트·스크립트용)
├─ agent.config.example.json
├─ worker_bus.gs          ← (선택) 시트버스용 '별도' Apps Script 웹앱 — 라이브 Code.gs 안 건드림
└─ install/
   ├─ install-task.ps1    ← 로그온 시·숨김·실패시재시작 자동시작 등록
   ├─ uninstall-task.ps1
   ├─ run-hidden.vbs      ← 검은 창 없이 node worker.js 실행하는 래퍼
   └─ start-agent.bat     ← 수동/디버그(콘솔 보임)용
```
런타임 산출물은 `_data/`(큐·`heartbeat.json`·`agent.log`·`schedule-state.json`)에 쌓이며 gitignore 됩니다.

---

## 3. 설치

**전제**
- Node.js (PATH 에 `node`). 이미 가드닝 대시보드를 돌리던 PC면 설치돼 있습니다.
- Playwright + 크롬. 이미 `_bat/install-playwright.bat` 로 설치돼 있으면 그대로 씁니다(스캔은 실제 크롬 창을 띄웁니다).
- `campaigns.json`, `.env`(선택: `TIKTOK_PROXY`) — Garden 루트의 기존 것을 그대로 공유합니다. **추가 설정 0.**

**(A) 자동시작 등록 — 권장 (bat/터미널 없이 로그온 시 백그라운드)**
```powershell
cd C:\Users\whwns\Desktop\VIBE\SIRIAI\Garden\_overnight\agent\install
powershell -ExecutionPolicy Bypass -File install-task.ps1
```
→ 작업 스케줄러에 `SIRIAI-ScanAgent` 가 **로그온 시 · 숨김 · 실패 시 재시작**으로 등록되고 즉시 시작됩니다.
관리자 권한 불필요. 검은 창은 안 뜹니다(로그는 `_data/agent.log`).

**(B) 수동/디버그 — 콘솔로 로그를 눈으로**
```
install\start-agent.bat        (더블클릭 또는)  node worker.js
```

> ★ **반드시 로그인 사용자 세션 작업**이어야 합니다. 진짜 Windows 서비스(Session 0)로 올리면
> `headless:false` 크롬이 화면 없이 못 뜨고 로봇 인증도 불가합니다(추천 아키텍처 §6 제약).
> 그래서 pm2/nssm 서비스가 아니라 **작업 스케줄러 '로그온 트리거'** 를 씁니다.

**제거**
```powershell
powershell -ExecutionPolicy Bypass -File uninstall-task.ps1
```

---

## 4. 쓰는 법

### 저녁 시간창 예약 (무인, 클릭 0)
- 워커 내장 시계가 매일 `19:30`·`21:30`(설정 가능)에 **업로드 스캔을 스스로 큐잉**합니다. Vercel Cron 의존 없음.
- **안전한 무인:** 쿠키(`data/tiktok-session.json`)로 통과되면 자동 진행. 로봇 인증이 뜨면 `graceMs`(기본 60초) 뒤
  진행을 시도하되, 틱톡이 막으면(연속 3회) **그 창을 접고** 상태를 `deferred` + **"세션 데우기 필요"** 로 남깁니다.
  크롬을 밤새 걸어두지 않고, CAPTCHA 를 자동으로 풀지 않습니다.
- 재시도는 스케줄 구조로: 업로드 스캔은 '미업로드 계정만' 대상이라 이번에 못 한 계정은 **다음 저녁창에 자연히 다시 대상**.
- PC 가 예약 시각에 깨어 있어야 합니다. 늦게 깨어나도 창 시각 +60분 안이면 그날치 1회는 발화합니다.

### 온디맨드 (사람 감독) — 터미널 없이
1. 브라우저로 **http://127.0.0.1:3939** 접속(북마크). 상단 배지로 🟢온라인 / ⚠️세션 데우기 필요 / 오프라인 확인.
2. **[업로드 스캔] / [조회수 스캔] / [전체 재스캔]** 버튼 클릭 → 요청이 큐에 들어가고 워커가 집습니다.
3. 크롬 창이 뜨면 로봇 인증을 사람이 통과한 뒤, 페이지의 **[스캔 시작]** 을 누릅니다(= 기존 `/confirm` 게이트).
4. 연속으로 막히면 페이지에 **[재개]/[중지]** 가 뜹니다(VPN 바꾸고 재개, 또는 접기). 진행률 `n/N` 실시간 표시.

> 이 로컬 페이지는 프로토타입의 온디맨드 진입점이자 **하트비트/진행/보류 배지**입니다.
> 최종 형태에서는 이 버튼·배지를 클라우드 대시보드로 올립니다(추천 아키텍처 §4·단계1 프론트 재배선).

### CLI (테스트·스크립트)
```
node enqueue.js --mode upload                 # 감독(기본)
node enqueue.js --mode perf --unattended      # 무인 조회수 스캔
node enqueue.js --type scan-one --row 42 --handle someuser
node enqueue.js --type judge-link --row 42 --link https://www.tiktok.com/@u/video/123
```

---

## 5. 설정 (`agent.config.json`, 선택)

`agent.config.example.json` 을 `agent.config.json` 으로 복사해 값만 바꾸면 됩니다. 없으면 기본값으로 돕니다.

| 키 | 기본 | 뜻 |
|---|---|---|
| `bus` | `local` | `local`=파일 큐(설치 0). `sheet`=아래 시트버스. |
| `controlPort` | `3939` | 127.0.0.1 상태/온디맨드 서버 포트. `0` 이면 끔. |
| `campaigns` | `all` | 저녁 예약이 스캔할 캠페인. `all` 또는 `["bayonn"]`. |
| `schedule.windows` | `["19:30","21:30"]` | 저녁 시간창. |
| `schedule.mode` | `upload` | `upload`/`full`/`perf`. |
| `schedule.graceMs` | `60000` | 무인 워밍업 자동 진행 유예. |
| `idlePollMs`/`activePollMs` | `10000`/`2500` | 유휴/활성 폴링 간격(감독 지연 최소화). |

---

## 6. (선택) 시트 버스 — 클라우드에서 큐에 넣기

로컬 큐만으로도 저녁예약·온디맨드가 다 됩니다. 클라우드 대시보드가 **시트에** 스캔요청을 꽂게 하려면 시트버스를 씁니다.

1. `worker_bus.gs` 를 **별도 Apps Script 프로젝트**(기존 Code.gs 와 다른 프로젝트)로 마스터 시트에 붙여 배포합니다.
   Apps Script 는 프로젝트당 `doPost` 가 하나뿐이라 **반드시 별도 프로젝트**여야 라이브 브릿지를 안 건드립니다.
2. 배포 URL/토큰을 `agent.config.json` 에:
   ```json
   { "bus": "sheet", "sheet": { "url": "<웹앱URL>", "token": "grdn_worker_x1" } }
   ```
3. 워커가 `_worker` 탭(요청·진행·결과)·`_worker_hb`(하트비트)를 폴링합니다. 데이터 열과 분리된 탭이라 경합 없음.

> 클라우드 대시보드가 이 `_worker` 탭에 직접 쓰게 하는 배선(서버 라우트/프론트)은 추천 아키텍처 **단계 1** 작업으로,
> 라이브 `server.js`·`app.js` 수정이 필요해 이 프로토타입 범위 밖입니다(문서화된 다음 스텝).

---

## 7. 견고함·한계 (알아둘 것)

- **단일 인스턴스 락**(`_data/agent.lock`, PID): 중복 실행=이중 스캔을 막습니다. 크래시로 남은 `active` 작업은
  다음 시작 때 `interrupted` 로 이관돼 같은 작업이 두 번 안 돕니다.
- **PC 꺼짐/절전** → 스캔 정지. 로컬 페이지 배지로 '왜 안 되는지'가 항상 보입니다(미스터리 제거).
- **무인 로봇인증/CAPTCHA** → 예약이 며칠 조용히 멈출 수 있음. 그래서 **"세션 데우기 필요" 배지가 필수**입니다.
  사람이 크롬 한 번 통과해 쿠키를 갱신하면 이후 며칠 다시 무인.
- **크래시 시 부분손실**: 스캔은 대상 처리 후 마지막에 시트에 되씁니다. 스캔 도중 프로세스가 죽으면 그 배치의
  시트 쓰기가 빠질 수 있으나, `detected.json` 도 안 써져 **다음 스캔이 그 계정을 다시 대상**으로 잡습니다.
- **적응형 폴링**: 유휴 10초, 인증대기/막힘/스캔 중 2.5초로 당겨 감독 클릭 지연을 줄입니다.
- **로그**: `_data/agent.log`. 최근 작업 요약은 상태 페이지 하단 표.
