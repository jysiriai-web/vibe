import HeroBackdrop from './HeroBackdrop.jsx'
import './Hero.css'

/* (0) 인트로(Hero) — 에디토리얼/갤러리 입구.
   "시리아이의 다양한 사업분야를 만나보세요" + 진입 유도.
   섹션 클릭은 편의 진입(노출 컨트롤 아님), 키보드/AT 진입은 실제 <button>이 담당. */
export default function Hero({ meta, onEnter, onBrand }) {
  const { hero, wordmark, jp } = meta
  return (
    <section className="hero" onClick={onEnter}>
      {/* 움직이는 흐르는 라인 배경 (콘텐츠 뒤) */}
      <HeroBackdrop />

      {/* 상단 아카이브 프레임 */}
      <div className="hero__frame">
        <button
          className="hero__brand"
          onClick={(e) => { e.stopPropagation(); onBrand() }}
        >
          <span className="hero__wordmark label-mono">{wordmark}</span>
          <span className="jp hero__brand-jp">{jp}</span>
        </button>
        <span className="hero__frame-mid label-mono">Business Overview</span>
        <span className="hero__frame-r label-mono">2026 — 01 / 04</span>
      </div>

      {/* 큰 사명 워터마크 (드문 에디토리얼 악센트) */}
      <span className="hero__watermark jp" aria-hidden="true">{jp}</span>

      <div className="hero__inner">
        <p className="hero__eyebrow label-mono">{hero.eyebrow}</p>
        <h1 className="hero__title">{hero.title}</h1>
        <p className="hero__sub">{hero.sub}</p>

        <button
          className="hero__enter"
          onClick={(e) => { e.stopPropagation(); onEnter() }}
          aria-label={hero.enter}
        >
          <span className="hero__enter-label">{hero.enter}</span>
          <span className="hero__arrow" aria-hidden="true">
            <svg viewBox="0 0 40 16" width="40" height="16" fill="none">
              <path d="M1 8h36M30 2l7 6-7 6" stroke="currentColor" strokeWidth="1.6"
                strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </button>
      </div>
    </section>
  )
}
