import { useEffect, useMemo, useState } from 'react'
import { prefersReducedMotion } from '../lib/useTypewriter.js'
import './QuestionCarousel.css'

const STEP = 23      // 챔버 사이 각도(deg)
const RADIUS = 158   // 실린더 반지름(px) — 세로 간격을 만든다
const VISIBLE = 64   // 전면에서 보이는 각도(±)
const STEP_MS = 2600 // 한 칸 회전 간격 (리볼버 '딸깍')

/* ★ "리볼버" 질문 드럼 — 3D 실린더가 한 칸씩 회전한다.
   각 칩이 실린더 표면에 붙어 텍스트째 기울며 돌아 진짜 회전체처럼 보인다.
   hover/focus 시 정지 → 클릭 → 답변. prefers-reduced-motion 시 정적 리스트. */
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
        className="drum"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocusCapture={() => setPaused(true)}
        onBlurCapture={() => setPaused(false)}
      >
        <div className="drum__stage">
          {ordered.map((q, idx) => {
            // 전면(start) 기준 각도 → [-180,180]로 래핑
            let a = (idx - start) * STEP
            a = ((a % 360) + 360) % 360
            if (a > 180) a -= 360
            const front = Math.abs(a) <= VISIBLE
            const near = Math.abs(a) <= VISIBLE + STEP
            const isActive = Math.abs(a) < STEP / 2
            const opacity = front ? Math.max(0.16, 1 - Math.abs(a) / 92) : 0

            return (
              <button
                key={q.id}
                className={`qchip drum__chip ${isActive ? 'is-active' : ''}`}
                onClick={() => onPick(q.id)}
                tabIndex={front ? 0 : -1}
                aria-hidden={!front}
                style={{
                  transform: `translate(-50%, -50%) rotateX(${a}deg) translateZ(${RADIUS}px)`,
                  opacity,
                  zIndex: 100 - Math.round(Math.abs(a)),
                  pointerEvents: front ? 'auto' : 'none',
                  transition: near
                    ? 'transform 0.6s var(--ease), opacity 0.6s var(--ease), background 0.2s, border-color 0.2s'
                    : 'none',
                }}
              >
                {q.question}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
