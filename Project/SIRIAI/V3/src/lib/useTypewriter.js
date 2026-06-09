import { useEffect, useRef, useState } from 'react'

// prefers-reduced-motion 여부 (세션 중 거의 안 바뀜 → 초기값으로 충분)
export const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/* 글자 한 자씩 노출되는 타자기 효과.
   - start=false면 대기(앞 문장 다 친 뒤 시작하도록 시퀀싱)
   - reduce=true면 즉시 전체 노출
   - skip()으로 즉시 완성 (클릭 시 건너뛰기) */
export function useTypewriter(text = '', { speed = 20, start = true, reduce = false } = {}) {
  const [i, setI] = useState(0)
  const timer = useRef(null)

  // 텍스트가 바뀌면 처음부터
  useEffect(() => { setI(0) }, [text])

  useEffect(() => {
    if (!start) return
    if (reduce) { setI(text.length); return }
    if (i >= text.length) return
    timer.current = setTimeout(() => setI((v) => v + 1), speed)
    return () => clearTimeout(timer.current)
  }, [i, text, start, speed, reduce])

  return {
    shown: text.slice(0, i),
    done: i >= text.length,
    typing: start && !reduce && i < text.length,
    skip: () => setI(text.length),
  }
}
