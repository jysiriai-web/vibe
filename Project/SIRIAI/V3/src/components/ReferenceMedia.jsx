import { useState } from 'react'
import './ReferenceMedia.css'

/* 레퍼런스 미디어 — 케이스(브랜드) 전환형 뷰어.
   cases = [{ key, brand, tag, src, caption }]. src 파일이 public/assets/ref/ 에 있으면 표시,
   없으면 브랜드 플레이스홀더("이미지 준비 중"). 단일 이미지면 탭 숨김. */
export default function ReferenceMedia({ cases = [], badge = '레퍼런스' }) {
  const [active, setActive] = useState(0)
  const [bad, setBad] = useState({})

  if (!cases.length) return null
  const item = cases[active] || cases[0]
  const showImg = item.src && !bad[active]

  return (
    <figure className="refmedia">
      <div className="refmedia__main">
        {showImg ? (
          <img
            src={item.src}
            alt={`${item.brand || ''} 캠페인 레퍼런스`}
            loading="lazy"
            onError={() => setBad((b) => ({ ...b, [active]: true }))}
          />
        ) : (
          <div className="refmedia__ph">
            {item.brand && <span className="refmedia__ph-brand">{item.brand}</span>}
            <span className="refmedia__ph-note label-mono">이미지 준비 중</span>
          </div>
        )}
        <span className="refmedia__badge label-mono">{badge}</span>
        {item.tag && <span className="refmedia__tag label-mono">{item.tag}</span>}
      </div>

      {cases.length > 1 && (
        <div className="refmedia__tabs" role="tablist" aria-label="레퍼런스 케이스">
          {cases.map((c, i) => (
            <button
              key={c.key || c.brand || i}
              role="tab"
              aria-selected={i === active}
              className={`refmedia__tab ${i === active ? 'is-active' : ''}`}
              onClick={() => setActive(i)}
            >
              {c.brand}
            </button>
          ))}
        </div>
      )}

      {item.caption && <figcaption className="refmedia__cap label-mono">{item.caption}</figcaption>}
    </figure>
  )
}
