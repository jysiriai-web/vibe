import { useEffect, useMemo, useRef } from 'react'
import { prefersReducedMotion } from '../lib/useTypewriter.js'
import './QuestionCarousel.css'

const STEP = 30       // 챔버 사이 각도(deg) — 중앙±2(0,±30,±60)=5챔버가 그림처럼 노출
const RADIUS = 150    // 실린더 반지름(px)
const VISIBLE = 66    // 전면 가시 각도(±)
const PERIOD_MS = 2600 // 한 챔버 넘어가는 시간 (롤링 속도)

/* 각도 a(=챔버의 현재 회전각)로부터 칩 스타일 계산 */
function styleFor(a) {
  a = ((a % 360) + 360) % 360
  if (a > 180) a -= 360
  const abs = Math.abs(a)
  const front = abs <= VISIBLE
  return {
    transform: `translate(-50%, -50%) rotateX(${a}deg) translateZ(${RADIUS}px)`,
    opacity: front ? Math.max(0.16, 1 - abs / 92) : 0,
    pe: front ? 'auto' : 'none',
    z: 100 - Math.round(abs),
    active: abs < STEP / 2,
    front,
  }
}

/* ★ "리볼버" 질문 롤러 — 3D 실린더가 끊김 없이 연속 회전(1→2→…→N→1 루프).
   각 챔버가 텍스트째 기울며 굴러간다. hover/focus 시 정지 → 클릭 → 답변.
   prefers-reduced-motion 시 정적 리스트. */
export default function QuestionCarousel({ qna, onPick }) {
  const ordered = useMemo(() => {
    const list = qna || []
    return [...list.filter((q) => q.entry), ...list.filter((q) => !q.entry)]
  }, [qna])

  const N = ordered.length
  const reduce = prefersReducedMotion()
  const refs = useRef([])
  const paused = useRef(false)

  // rAF로 매 프레임 회전(연속). DOM을 직접 갱신 → React 리렌더 없음.
  useEffect(() => {
    if (reduce || N <= 1) return
    let raf
    let pos = 0
    let last = performance.now()
    const speed = 1 / PERIOD_MS // 초당 1/2.6 챔버
    const tick = (now) => {
      const dt = Math.min(now - last, 64)
      last = now
      if (!paused.current) pos = (pos + dt * speed) % N
      for (let i = 0; i < refs.current.length; i++) {
        const el = refs.current[i]
        if (!el) continue
        const s = styleFor((i - pos) * STEP)
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
  }, [reduce, N])

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
        onMouseEnter={() => { paused.current = true }}
        onMouseLeave={() => { paused.current = false }}
        onFocusCapture={() => { paused.current = true }}
        onBlurCapture={() => { paused.current = false }}
      >
        <div className="drum__stage">
          {ordered.map((q, idx) => {
            const s0 = styleFor(idx * STEP) // 초기 프레임(첫 렌더 깜빡임 방지)
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
