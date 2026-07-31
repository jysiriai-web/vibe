# 스캔 에이전트를 '로그온 시 · 숨김 · 실패 시 재시작'으로 작업 스케줄러에 등록.
# 관리자 권한 불필요(로그인 사용자 세션 작업). PowerShell 에서 그냥 실행:
#     powershell -ExecutionPolicy Bypass -File install-task.ps1
# ★ 반드시 '로그인 사용자 세션'이어야 함 — 진짜 서비스(Session 0)로 올리면 headless:false 크롬이
#   화면 없이 못 뜨고 로봇 인증도 불가(추천 아키텍처 §6 제약).
$ErrorActionPreference = 'Stop'
$taskName = 'SIRIAI-ScanAgent'
$vbs = Join-Path $PSScriptRoot 'run-hidden.vbs'
if (-not (Test-Path $vbs)) { throw "run-hidden.vbs 를 못 찾음: $vbs" }

# node 존재 확인(등록은 되지만 미리 알려줌)
$node = (Get-Command node -ErrorAction SilentlyContinue)
if (-not $node) { Write-Warning 'node 를 PATH 에서 못 찾음. Node.js 설치 후 다시 시도하세요.' }

$action    = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument ('"' + $vbs + '"')
$trigger   = New-ScheduledTaskTrigger -AtLogOn
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
$settings  = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
              -StartWhenAvailable -Hidden -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) `
              -ExecutionTimeLimit ([TimeSpan]::Zero)

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
  -Principal $principal -Settings $settings -Force | Out-Null

Start-ScheduledTask -TaskName $taskName
Write-Host "[OK] '$taskName' 등록 완료 — 로그온 시 숨김 자동시작 + 실패 시 재시작. 지금 바로 시작했습니다."
Write-Host "     상태 보기:  http://127.0.0.1:3939   (제어서버가 켜진 경우)"
Write-Host "     제거:       powershell -ExecutionPolicy Bypass -File uninstall-task.ps1"
