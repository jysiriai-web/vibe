# 스캔 에이전트 자동시작 작업을 제거하고, 돌고 있으면 멈춘다.
#     powershell -ExecutionPolicy Bypass -File uninstall-task.ps1
$ErrorActionPreference = 'SilentlyContinue'
$taskName = 'SIRIAI-ScanAgent'
Stop-ScheduledTask -TaskName $taskName
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
Write-Host "[OK] '$taskName' 제거 완료. (실행 중이던 node worker.js 프로세스는 로그아웃/재부팅 또는 작업관리자에서 종료됩니다.)"
