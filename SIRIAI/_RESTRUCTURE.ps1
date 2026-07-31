param([switch]$DryRun)
# SIRIAI 폴더 재구성 — 안전판 v2
#
#   미리보기:  powershell -ExecutionPolicy Bypass -File .\_RESTRUCTURE.ps1 -DryRun
#   실제실행:  powershell -ExecutionPolicy Bypass -File .\_RESTRUCTURE.ps1
#
#   ※ 실행 전 Claude Code · VSCode · 탐색기(SIRIAI 하위) · 터미널 전부 닫기
#
#   결과:  SIRIAI\Sales\{Routine, intercharm}
#          SIRIAI\Campaign\{댄스캠페인(구 Garden), US_seeding}
#          SIRIAI\Company\{DECK, _shared}
#
#   안전장치: ①잠김점검 ②git 스냅샷 성공 검증(실패시 중단) ③동일볼륨 확인
#            ④이동 실패시 자동 롤백 ⑤검증 ⑥사람이 할 일 안내

$ROOT = "C:\Users\whwns\Desktop\VIBE\SIRIAI"
$VIBE = "C:\Users\whwns\Desktop\VIBE"

# ── 폴더명 (바꾸려면 여기만) ──────────────────────────────
$SALES      = "Sales"
$CAMPAIGN   = "Campaign"
$COMPANY    = "Company"
$GARDEN_NEW = "댄스캠페인"     # 한글이 걱정되면 "DanceCampaign"
# ────────────────────────────────────────────────────────

$moves = @(
  @{ src="Routine";    dst="$SALES\Routine" },
  @{ src="intercharm"; dst="$SALES\intercharm" },
  @{ src="Garden";     dst="$CAMPAIGN\$GARDEN_NEW" },
  @{ src="US_seeding"; dst="$CAMPAIGN\US_seeding" },
  @{ src="DECK";       dst="$COMPANY\DECK" },
  @{ src="_shared";    dst="$COMPANY\_shared" }
)

if ($DryRun) { Write-Host "`n=== [미리보기 모드] 실제로는 아무것도 바꾸지 않습니다 ===" -ForegroundColor Magenta }
else         { Write-Host "`n=== SIRIAI 폴더 재구성 ===" -ForegroundColor Cyan }
Set-Location $ROOT

# ── [0] 동일 볼륨 확인 (같은 드라이브면 이동=즉시 rename, 파일 복사 없음) ──
Write-Host "`n[0] 볼륨 확인..." -ForegroundColor Yellow
Write-Host "  대상 드라이브: $((Get-Item $ROOT).PSDrive.Name):  (같은 드라이브 내 이동 = 즉시 rename, 데이터 복사 없음 → 안전)"

# ── [1] 잠김 점검 ──
Write-Host "`n[1] 잠김 점검..." -ForegroundColor Yellow
Get-ChildItem -Directory -Filter "*._locktest" -ErrorAction SilentlyContinue | ForEach-Object {
  $orig = $_.Name -replace '\._locktest$',''
  if (-not (Test-Path $orig)) { Rename-Item $_.FullName $orig; Write-Host "  (이전 실행 흔적 복구) $orig" }
}
$locked = @(); $missing = @()
foreach ($m in $moves) {
  $t = $m.src
  if (-not (Test-Path $t)) { $missing += $t; continue }
  try {
    Rename-Item $t "$t._locktest" -ErrorAction Stop
    Rename-Item "$t._locktest" $t -ErrorAction Stop
  } catch {
    $locked += $t
    if (Test-Path "$t._locktest") { try { Rename-Item "$t._locktest" $t } catch {} }
  }
}
if ($missing.Count -gt 0) { Write-Host "  - 없는 폴더(건너뜀): $($missing -join ', ')" }
if ($locked.Count -gt 0) {
  Write-Host "`n  X 잠긴 폴더: $($locked -join ', ')" -ForegroundColor Red
  Write-Host "  -> 그 폴더를 쓰는 앱(Claude Code / VSCode / 탐색기 / 터미널 / node)을 닫고 다시 실행" -ForegroundColor Red
  exit 1
}
Write-Host "  OK 전부 이동 가능"

# ── [2] git 스냅샷 (되돌리기용) — 성공 못 하면 중단 ──
Write-Host "`n[2] git 스냅샷..." -ForegroundColor Yellow
Set-Location $VIBE
$headBefore = (git rev-parse HEAD)
if ($LASTEXITCODE -ne 0) {
  Write-Host "  X git 저장소를 읽을 수 없습니다. 되돌릴 수단이 없어 중단합니다." -ForegroundColor Red
  exit 1
}
Write-Host "  현재 HEAD: $($headBefore.Substring(0,8))"
if (-not $DryRun) {
  git add -A | Out-Null
  $stamp = Get-Date -Format "yyyy-MM-dd HH:mm"
  git commit -m "chore: SIRIAI restructure snapshot ($stamp)" | Out-Null
  $headAfter = (git rev-parse HEAD)
  if ($headAfter -eq $headBefore) {
    $dirty = (git status --porcelain)
    if ([string]::IsNullOrWhiteSpace($dirty)) {
      Write-Host "  OK 변경사항 없음 — 현재 커밋이 복구 지점: $($headBefore.Substring(0,8))"
    } else {
      Write-Host "  X 커밋에 실패했고 작업트리가 더럽습니다. 되돌릴 수단이 불완전해 중단합니다." -ForegroundColor Red
      Write-Host "     수동으로: cd $VIBE ; git add -A ; git commit -m snapshot" -ForegroundColor Red
      exit 1
    }
    $RESTORE = $headBefore
  } else {
    Write-Host "  OK 스냅샷 커밋 완료 -> 복구 지점: $($headAfter.Substring(0,8))"
    $RESTORE = $headAfter
  }
} else {
  Write-Host "  (미리보기: 커밋 생략)"
  $RESTORE = $headBefore
}
Set-Location $ROOT

# ── [3] 새 폴더 ──
Write-Host "`n[3] 폴더 생성..." -ForegroundColor Yellow
foreach ($d in @($SALES,$CAMPAIGN,$COMPANY)) {
  if (Test-Path $d) { Write-Host "  = $d (이미 있음)" }
  elseif ($DryRun)  { Write-Host "  + $d (예정)" }
  else { New-Item -ItemType Directory $d | Out-Null; Write-Host "  + $d" }
}

# ── [4] 이동 (실패하면 자동 롤백) ──
Write-Host "`n[4] 이동..." -ForegroundColor Yellow
$doneMoves = @()
$failed = $null
foreach ($m in $moves) {
  if (-not (Test-Path $m.src)) { continue }
  if (Test-Path $m.dst) { Write-Host "  ! $($m.dst) 이미 존재 - 건너뜀" -ForegroundColor Red; continue }
  if ($DryRun) { Write-Host "  -> $($m.src)  =>  $($m.dst)  (예정)"; continue }
  try {
    Move-Item $m.src $m.dst -ErrorAction Stop
    $doneMoves += $m
    Write-Host "  OK $($m.src)  =>  $($m.dst)"
  } catch {
    $failed = "$($m.src) : $($_.Exception.Message)"
    break
  }
}
if ($failed) {
  Write-Host "`n  X 이동 실패: $failed" -ForegroundColor Red
  Write-Host "  -> 자동 롤백 시작..." -ForegroundColor Yellow
  [array]::Reverse($doneMoves)
  foreach ($m in $doneMoves) {
    try { Move-Item $m.dst $m.src -ErrorAction Stop; Write-Host "     되돌림: $($m.dst) => $($m.src)" }
    catch { Write-Host "     ! 롤백 실패: $($m.dst) — 수동 확인 필요" -ForegroundColor Red }
  }
  Write-Host "`n  원상복구 시도 완료. 문제 해결 후 다시 실행하세요." -ForegroundColor Yellow
  Write-Host "  (완전 복구가 필요하면: cd $VIBE ; git reset --hard $RESTORE)" -ForegroundColor Yellow
  exit 1
}

if ($DryRun) {
  Write-Host "`n=== 미리보기 끝 — 실제 변경 없음 ===" -ForegroundColor Magenta
  Write-Host "문제 없어 보이면 -DryRun 빼고 다시 실행하세요." -ForegroundColor Magenta
  exit 0
}

# ── [5] 작업 스케줄러 재등록 ──
Write-Host "`n[5] 작업 스케줄러 갱신..." -ForegroundColor Yellow
$rt = "$ROOT\$SALES\Routine"
if (Test-Path "$rt\.venv\Scripts\python.exe") {
  try {
    $a = New-ScheduledTaskAction -Execute "$rt\.venv\Scripts\python.exe" -Argument "4_track\daily_refresh.py" -WorkingDirectory $rt
    Set-ScheduledTask -TaskName "SIRIAI_daily_refresh" -Action $a -ErrorAction Stop | Out-Null
    Write-Host "  OK SIRIAI_daily_refresh -> 새 경로"
  } catch { Write-Host "  ! SIRIAI_daily_refresh 갱신 실패(관리자 권한 필요할 수 있음): $($_.Exception.Message)" -ForegroundColor Red }
} else { Write-Host "  ! .venv 못 찾음 - daily_refresh 수동 확인" -ForegroundColor Red }
$gs = "$ROOT\$CAMPAIGN\$GARDEN_NEW\scripts\run-sync.bat"
if (Test-Path $gs) {
  try {
    $a2 = New-ScheduledTaskAction -Execute $gs
    Set-ScheduledTask -TaskName "SIRIAI_Garden_Sync" -Action $a2 -ErrorAction Stop | Out-Null
    Write-Host "  OK SIRIAI_Garden_Sync -> 새 경로 (Disabled 유지)"
  } catch { Write-Host "  - SIRIAI_Garden_Sync 갱신 스킵: $($_.Exception.Message)" }
}

# ── [6] 검증 ──
Write-Host "`n[6] 검증..." -ForegroundColor Yellow
$okAll = $true
foreach ($m in $moves) {
  $p = Join-Path $ROOT $m.dst
  if (Test-Path $p) { Write-Host "  OK $($m.dst)" }
  elseif (Test-Path (Join-Path $ROOT $m.src)) { Write-Host "  ! $($m.src) 안 옮겨짐" -ForegroundColor Red; $okAll=$false }
}
$py = "$rt\.venv\Scripts\python.exe"
if (Test-Path $py) {
  Push-Location $rt
  $code = 'import sys;from pathlib import Path as P;f=P("0_intake/_classify_new.py").resolve();rt=next((q/"Routine" for q in f.parents if (q/"Routine"/"_shared").is_dir()),None);sys.path.insert(0,str(rt));import _shared.sheets;print("PY-OK")'
  $out = & $py -c $code
  Pop-Location
  if ($LASTEXITCODE -eq 0) { Write-Host "  OK 파이썬 경로해석 + _shared import 정상" }
  else { Write-Host "  X 파이썬 스모크 실패: $out" -ForegroundColor Red; $okAll=$false }
} else { Write-Host "  ! .venv 없음 - 파이썬 검증 생략" -ForegroundColor Red }
$gdir = "$ROOT\$CAMPAIGN\$GARDEN_NEW"
if (Test-Path "$gdir\package.json") {
  Push-Location $gdir
  & node -e "console.log('NODE-OK')" | Out-Null
  if ($LASTEXITCODE -eq 0) { Write-Host "  OK node 실행 정상 (한글 폴더명 문제 없음)" }
  else { Write-Host "  ! node 실행 이상 - `$GARDEN_NEW 를 DanceCampaign 으로 바꿔보세요" -ForegroundColor Red }
  Pop-Location
}

# ── [7] git 반영 ──
Write-Host "`n[7] git 반영..." -ForegroundColor Yellow
Set-Location $VIBE
git add -A | Out-Null
git commit -m "refactor: SIRIAI restructure (Sales/Campaign/Company, Garden to $GARDEN_NEW)" | Out-Null
Write-Host "  OK 커밋 완료"

Write-Host "`n=== 완료 ===" -ForegroundColor Cyan
if ($okAll) { Write-Host "전부 정상." -ForegroundColor Green } else { Write-Host "일부 항목 확인 필요 (위 빨간 줄)" -ForegroundColor Red }
Write-Host @"

[남은 수동 작업]
  1. Claude Code 세션 재연결 - 각 세션에서 새 폴더 열기
       세일즈|자동화         -> SIRIAI\$SALES\Routine
       세일즈|마스터시트      -> SIRIAI\$SALES\Routine
       세일즈|이메일 템플릿   -> SIRIAI\$SALES\Routine
       세일즈|사업소개서      -> SIRIAI\$COMPANY\DECK
       캠페인|댄스캠페인      -> SIRIAI\$CAMPAIGN\$GARDEN_NEW
       캠페인|틱톡키워드확인기 -> SIRIAI\$CAMPAIGN\US_seeding
  2. 바탕화면 바로가기(.url/.lnk) 있으면 경로 갱신
  3. Vercel 은 projectId 연결이라 재설정 불필요

[문제 생기면 되돌리기]
  cd $VIBE
  git reset --hard $RESTORE
"@ -ForegroundColor Yellow
