import './HeroBackdrop.css'

/* 히어로 배경 — 가로로 천천히 흐르는 등고선 웨이브(대화의 강 모티프).
   잉크 헤어라인 저투명, 패턴이 한 화면 폭마다 반복되어 seamless 루프.
   파장(wl)은 1440을 나누는 값만 사용 → -50%(=1440u) 이동 시 이음매 없음. */
const VW = 1440
const VH = 900
const TW = VW * 2 // 패턴을 2배 폭으로 그려 -50% 이동으로 무한 흐름

function wave(y, amp, wl) {
  const half = wl / 2
  let d = `M0 ${y}`
  let x = 0
  let up = true
  while (x < TW) {
    const nx = x + half
    d += ` Q ${x + half / 2} ${up ? y - 2 * amp : y + 2 * amp} ${nx} ${y}`
    x = nx
    up = !up
  }
  return d
}

const LINES = [
  { y: 150, amp: 24, wl: 480, w: 1.1, o: 0.1, dur: 27, rev: false },
  { y: 315, amp: 32, wl: 720, w: 1.3, o: 0.07, dur: 35, rev: true },
  { y: 465, amp: 20, wl: 360, w: 1.0, o: 0.09, dur: 22, rev: false },
  { y: 620, amp: 28, wl: 288, w: 1.2, o: 0.06, dur: 31, rev: true },
  { y: 770, amp: 22, wl: 720, w: 1.4, o: 0.08, dur: 39, rev: false },
]

export default function HeroBackdrop() {
  return (
    <svg
      className="hero-bg"
      viewBox={`0 0 ${VW} ${VH}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      {LINES.map((l, i) => (
        <g
          key={i}
          className={`hero-bg__flow ${l.rev ? 'is-rev' : ''}`}
          style={{ '--dur': `${l.dur}s` }}
        >
          <path
            d={wave(l.y, l.amp, l.wl)}
            fill="none"
            stroke="var(--ink)"
            strokeWidth={l.w}
            strokeOpacity={l.o}
            strokeLinecap="round"
          />
        </g>
      ))}
    </svg>
  )
}
