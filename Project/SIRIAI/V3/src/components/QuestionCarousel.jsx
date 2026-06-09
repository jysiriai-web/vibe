import { useEffect, useMemo, useRef } from 'react'
import { prefersReducedMotion } from '../lib/useTypewriter.js'
import './QuestionCarousel.css'

const RADIUS = 118     // 실린더 반지름(px) — 작게 = 여백 줄임
const VISIBLE = 66     // 전면 가시 각도(±)
const PERIOD_MS = 2800 // 한 챔버 넘어가는 시간 (롤링 속도)

/* 각도 a로부터 칩 스타일 계산 (step = 챔버 간격) */
function styleFor(a, step) {
  a = ((a % 360) + 360) % 360
  if (a > 180) a -= 360
  const abs = Math.abs(a)
  const front = abs <= VISIBLE
  return {
    transform: `translate(-50%, -50%) rotateX(${a}deg) translateZ(${RADIUS}px)`,
    opacity: front ? Math.max(0.16, 1 - abs / 92) : 0,
    pe: front ? 'auto' : 'none',
    z: 100 - Math.round(abs),
    active: abs < step / 2,
    front,
  }
}

/* ★ 질문 롤러 — 3D 실린더가 끊김 없이 연속 회전(1→2→…→N→1).
   챔버 간격 = 360/N → 빈 구간 없이 꽉 차서 루프. hover/focus 시 정지. */
export default function QuestionCarousel({ qna, onPick }) {
  const ordered = useMemo(() => {
    const list = qna || []
    return [...list.filter((q) => q.entry), ...list.filter((q) => !q.entry)]
  }, [qna])

  const N = ordered.length
  const step = N > 0 ? 360 / N : 360 // 한 바퀴를 N등분 → 빈 구간 0
  const reduce = prefersReducedMotion()
  const refs = useRef([])
  const paused = useRef(false)

  useEffect(() => {
    if (reduce || N <= 1) return
    let raf
    let pos = 0
    let last = performance.now()
    const speed = 1 / PERIOD_MS
    const tick = (now) => {
      const dt = Math.min(now - last, 64)
      last = now
      if (!paused.current) pos = (pos + dt * speed) % N
      for (let i = 0; i < refs.current.length; i++) {
        const el = refs.current[i]
        if (!el) continue
        const s = styleFor((i - pos) * step, step)
        el.style.transform = s.transform
        el.style.opacity = s.opacity
        el.style.pointerEvents = s.pe
        el.style.zIndex = String(s.z)
        el.tabIndex = s.front ? 0 : -1
        el.classList.toggle('is-active', s.active)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [reduce, N, step])

  if (N === 0) return null

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
        onMouseEnter={() => { paused.current = true }}
        onMouseLeave={() => { paused.current = false }}
        onFocusCapture={() => { paused.current = true }}
        onBlurCapture={() => { paused.current = false }}
      >
        <div className="drum__stage">
          {ordered.map((q, idx) => {
            const s0 = styleFor(idx * step, step)
            return (
              <button
                key={q.id}
                ref={(el) => { refs.current[idx] = el }}
                className={`qchip drum__chip ${s0.active ? 'is-active' : ''}`}
                onClick={() => onPick(q.id)}
                style={{ transform: s0.transform, opacity: s0.opacity, pointerEvents: s0.pe, zIndex: s0.z }}
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
