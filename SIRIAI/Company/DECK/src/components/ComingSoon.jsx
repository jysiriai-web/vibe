import CTA from './CTA.jsx'
import './ComingSoon.css'

/* coming_soon 분야 상세 — 상투어 없이 헤드라인 + 암시(teaser) + 가벼운 CTA */
export default function ComingSoon({ area, meta }) {
  return (
    <div className="soon">
      <div className="soon__inner">
        <p className="soon__eyebrow en label-mono">{area.hero?.eyebrow}</p>
        <h1 className="soon__headline">{area.hero?.headline}</h1>
        {area.hero?.sub && <p className="soon__hero-sub en">{area.hero.sub}</p>}

        {area.teaser && (
          <div className="soon__teaser">
            <p className="soon__line">{area.teaser.line}</p>
            {area.teaser.sub && <p className="soon__teaser-sub">{area.teaser.sub}</p>}
          </div>
        )}

        {area.tech && <p className="soon__tech label-mono">{area.tech}</p>}

        <div className="soon__cta">
          <CTA meta={meta} variant="inline" />
        </div>
      </div>
    </div>
  )
}
