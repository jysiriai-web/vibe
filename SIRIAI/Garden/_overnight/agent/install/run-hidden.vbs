' 스캔 에이전트를 '검은 창 없이' 백그라운드로 실행하는 래퍼.
' 작업 스케줄러(로그온 시)가 이 vbs 를 호출한다. node 는 PATH 에 있어야 함.
Option Explicit
Dim fso, sh, thisDir, agentDir
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh  = CreateObject("WScript.Shell")
thisDir  = fso.GetParentFolderName(WScript.ScriptFullName)   ' ...\agent\install
agentDir = fso.GetParentFolderName(thisDir)                   ' ...\agent
sh.CurrentDirectory = agentDir
sh.Environment("PROCESS")("AGENT_QUIET") = "1"               ' 콘솔 로그 억제(파일 로그는 남음)
' 0 = 창 숨김, False = 반환을 기다리지 않음(에이전트가 계속 돎)
sh.Run "node """ & agentDir & "\worker.js""", 0, False
