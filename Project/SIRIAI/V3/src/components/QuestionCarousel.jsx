import { useEffect, useMemo, useState } from 'react'
import { prefersReducedMotion } from '../lib/useTypewriter.js'
import './QuestionCarousel.css'

const RADIUS = 2 // 중심 위/아래로 보이는 슬롯 수 (총 5칸 노출)
const STEP_MS = 2400 // 한 칸 회전 간격 (리볼버 '딸깍')

/* ★ "리볼버" 질문 휠
   - 질문들이 고정 슬롯에서 한 칸씩 회전(중심 칸이 가장 또렷)
   - hover/focus 시 정지 → 그때 클릭, 클릭 시 답변 오픈
   - prefers-reduced-motion 시 정적 리스트 */
export default function QuestionCarousel({ qna, onPick }) {
  const ordered = useMemo(() => {
    const list = qna || []
    return [...list.filter((q) => q.entry), ...list.filter((q) => !q.entry)]
  }, [qna])

  const N = ordered.length
  const reduce = prefersReducedMotion()
  const [start, setStart] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (reduce || paused || N <= 1) return
    const id = setInterval(() => setStart((s) => (s + 1) % N), STEP_MS)
    return () => clearInterval(id)
  }, [reduce, paused, N])

  if (N === 0) return null

  // 정적(모션 최소화) 버전
  if (reduce) {
    return (
      <div className="carousel" aria-label="예상 질문">
        <p className="carousel__hint label-mono">궁금한 걸 눌러보세요</p>
        <ul className="carousel__static">
          {ordered.map((q) => (
            <li key={q.id}>
              <button className="qchip" onClick={() => onPick(q.id)}>{q.question}</button>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <div className="carousel" aria-label="예상 질문">
      <p className="carousel__hint label-mono">궁금한 걸 눌러보세요 · 멈추려면 위에 올려두세요</p>
      <div
        className="wheel"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocusCapture={() => setPaused(true)}
        onBlurCapture={() => setPaused(false)}
      >
        {ordered.map((q, idx) => {
          // 중심(start) 기준 상대 슬롯 r ∈ [-N/2, N/2]
          let r = (idx - start) % N
          if (r > N / 2) r -= N
          else if (r < -N / 2) r += N

          const visible = Math.abs(r) <= RADIUS
          const near = Math.abs(r) <= RADIUS + 1
          const pos = Math.max(-(RADIUS + 1), Math.min(RADIUS + 1, r))
          const opacity = visible ? (r === 0 ? 1 : Math.abs(r) === 1 ? 0.8 : 0.42) : 0

          return (
            <button
              key={q.id}
              className={`qchip wheel__chip ${r === 0 ? 'is-active' : ''}`}
              onClick={() => onPick(q.id)}
              tabIndex={visible ? 0 : -1}
              aria-hidden={!visible}
              style={{
                transform: `translate(-50%, calc(${pos} * var(--slot) - 50%))`,
                opacity,
                zIndex: 10 - Math.abs(r),
                pointerEvents: visible ? 'auto' : 'none',
                transition: near
                  ? 'transform 0.55s var(--ease), opacity 0.55s var(--ease), background 0.2s, border-color 0.2s'
                  : 'none',
              }}
            >
              {q.question}
            </button>
          )
        })}
      </div>
    </div>
  )
}
