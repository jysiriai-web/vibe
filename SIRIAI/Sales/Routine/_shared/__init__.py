"""_shared — 모든 Routine 루틴이 공유하는 인프라.

시트 접근(sheets)·설정(config)·이름 정규화(normalize)·백업(backup).
각 루틴(siriai-coldmail, mailsuite-sync, …)은 `from _shared import ...` 로 가져다 쓴다.
import 가능하려면 Routine/ 가 sys.path 에 있어야 한다(각 루틴 run.py 가 추가).
"""
