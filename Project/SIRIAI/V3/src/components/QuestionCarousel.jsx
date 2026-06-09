import { useEffect, useMemo, useRef } from 'react'
import { prefersReducedMotion } from '../lib/useTypewriter.js'
import './QuestionCarousel.css'

const SLOT = 66       // 슬롯(바) 세로 간격(px)
const PERIOD_MS = 2500 // 한 칸 굴러 올라가는 시간

/* 평면 롤러 — 질문 바가 세로로 쌓여 끊김없이 굴러 올라간다(대화의 강 + 리볼버).
   가운데가 가장 크고 또렷, 위아래로 작아지고 흐려진다. 1→2→…→N→1 루프.
   3D 기울임 없음(평평). hover/focus 시 정지. reduce-motion 시 정적 리스트. */
function styleFor(r, vis) {
  const dist = Math.abs(r)
  const hidden = dist > vis
  const k = Math.min(dist / vis, 1)
  return {
    y: r * SLOT,
    scale: hidden ? 0.66 : 1 - k * 0.3,        // 중앙 1.0 → 가장자리 0.7
    opacity: hidden ? 0 : Math.max(0, 1 - k * 0.85), // 중앙 1 → 가장자리 0.15
    active: dist < 0.5,
    visible: !hidden,
    z: 100 - Math.round(dist * 10),
  }
}

export default function QuestionCarousel({ qna, onPick }) {
  const ordered = useMemo(() => {
    const list = qna || []
    return [...list.filter((q) => q.entry), ...list.filter((q) => !q.entry)]
  }, [qna])

  const N = ordered.length
  // 보이는 반경(슬롯 수). 작은 N에선 줄여 래핑 점프가 화면 밖(투명)에서 일어나게.
  const vis = N <= 5 ? Math.max(1, N / 2 - 0.5) : 2.4
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
        let r = ((i - pos) % N + N) % N
        if (r > N / 2) r -= N
        const s = styleFor(r, vis)
        el.style.transform = `translate(-50%, calc(${s.y}px - 50%)) scale(${s.scale})`
        el.style.opacity = s.opacity
        el.style.zIndex = String(s.z)
        el.style.pointerEvents = s.visible ? 'auto' : 'none'
        el.tabIndex = s.visible ? 0 : -1
        el.classList.toggle('is-active', s.active)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [reduce, N, vis])

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
        className="roller"
        onMouseEnter={() => { paused.current = true }}
        onMouseLeave={() => { paused.current = false }}
        onFocusCapture={() => { paused.current = true }}
        onBlurCapture={() => { paused.current = false }}
      >
        {ordered.map((q, idx) => {
          const s0 = styleFor(idx <= N / 2 ? idx : idx - N, vis)
          return (
            <button
              key={q.id}
              ref={(el) => { refs.current[idx] = el }}
              className={`qbar ${s0.active ? 'is-active' : ''}`}
              onClick={() => onPick(q.id)}
              style={{
                transform: `translate(-50%, calc(${s0.y}px - 50%)) scale(${s0.scale})`,
                opacity: s0.opacity,
                zIndex: s0.z,
                pointerEvents: s0.visible ? 'auto' : 'none',
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
