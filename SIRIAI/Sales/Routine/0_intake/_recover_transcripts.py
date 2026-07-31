"""죽은 소싱 런 트랜스크립트에서 '검색량 + 건진 브랜드' 복구. (스크래치)
워크플로우 최종값이 0이어도 에이전트가 검색·도출한 내용은 트랜스크립트에 남음.
"""
import json, re, sys
from pathlib import Path
for _s in (sys.stdout, sys.stderr):
    try: _s.reconfigure(encoding="utf-8")
    except Exception: pass

BASE = Path(r"C:\Users\whwns\.claude\projects\C--Users-whwns-Desktop-VIBE-SIRIAI-Routine\8dad15f5-43aa-4fd9-a1fe-da467aa9bfa8\subagents\workflows")
RUNS = ["wf_928938cf-d72", "wf_bcdc87d7-7f5"]
NICHE_RE = re.compile(r'담당 니치 ===\\n"([^"]+)"')


def blocks(content):
    return content if isinstance(content, list) else []


def main():
    recovered = []   # 건진 후보 (StructuredOutput 또는 텍스트)
    TAILS = []
    for run in RUNS:
        d = BASE / run
        if not d.exists(): continue
        print("=" * 70)
        print(f"런 {run}")
        for f in sorted(d.glob("agent-*.jsonl")):
            niche = "?"; queries = []; fetches = []; structured = None; last_texts = []
            for line in f.read_text(encoding="utf-8").splitlines():
                try: ev = json.loads(line)
                except Exception: continue
                msg = ev.get("message", {})
                content = msg.get("content")
                if isinstance(content, str):
                    m = NICHE_RE.search(content)
                    if m: niche = m.group(1)
                    continue
                for b in blocks(content):
                    if b.get("type") == "tool_use":
                        n = b.get("name", ""); inp = b.get("input", {}) or {}
                        if n == "WebSearch": queries.append(inp.get("query", ""))
                        elif n == "WebFetch": fetches.append(inp.get("url", ""))
                        elif "StructuredOutput" in n or "candidates" in json.dumps(inp, ensure_ascii=False):
                            if isinstance(inp, dict) and inp.get("candidates"): structured = inp
                    elif b.get("type") == "text":
                        last_texts.append(b.get("text", ""))
            print(f"\n■ {f.name[:20]} · 니치: {niche}")
            print(f"   웹검색 {len(queries)}회 · 웹페치 {len(fetches)}회")
            for q in queries[:8]: print(f"     검색: {q}")
            if structured:
                cs = structured.get("candidates", [])
                print(f"   ★ StructuredOutput 도달! 후보 {len(cs)}개 복구:")
                for c in cs:
                    print(f"      - {c.get('brand')} | {c.get('category')} | {c.get('instagram')}")
                    recovered.append({**c, "niche": niche, "run": run})
            else:
                # 마지막 추론 텍스트 = 후보 초안. 파일로 덤프.
                tail = "\n".join(t for t in last_texts if t.strip())
                if len(queries) >= 5 and tail.strip():
                    TAILS.append(f"\n{'='*60}\n[{run}] {f.name} · 검색 {len(queries)}회\n{'-'*60}\n{tail[-2500:]}")
    Path(Path(__file__).resolve().parent / "_recovered_tails.txt").write_text("\n".join(TAILS), encoding="utf-8")
    print("\n" + "=" * 70)
    print(f"복구된 구조화 후보: {len(recovered)}개 · 추론덤프 _recovered_tails.txt ({len(TAILS)}개 에이전트)")
    if recovered:
        out = Path(__file__).resolve().parent / "_recovered_candidates.json"
        out.write_text(json.dumps(recovered, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"→ {out.name}")


if __name__ == "__main__":
    main()
