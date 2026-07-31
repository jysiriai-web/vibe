import './ReferenceModule.css'

/* 함께한 브랜드/사례 — 데이터 기반. 빈 배열이면 자동 숨김. */
export default function ReferenceModule({ references, note }) {
  if (!references || references.length === 0) return null

  return (
    <section className="refs">
      <p className="refs__label label-mono">함께한 브랜드 · 사례</p>
      <ul className="refs__grid">
        {references.map((r, i) => {
          // 공개동의(consent) 전에는 실명 대신 익명 표기(displayBrand/group)로 마스킹
          const name = r.consent === 'ok' || r.consent === 'confidential'
            ? r.brand
            : (r.displayBrand || r.group || r.brand)
          return (
          <li key={i} className="refcard">
            <div className="refcard__top">
              <span className="refcard__brand">{name}</span>
              {r.group && <span className="refcard__group label-mono">{r.group}</span>}
            </div>
            <p className="refcard__summary">{r.summary}</p>
            <div className="refcard__meta">
              {r.metric && <span className="refcard__metric">{r.metric}</span>}
              {r.region && <span className="refcard__region label-mono">{r.region}</span>}
            </div>
            <div className="refcard__flags">
              {r.partner && <span className="refcard__flag label-mono">파트너 현지 실행</span>}
              {r.consent === 'confidential' && (
                <span className="refcard__flag label-mono">대외비</span>
              )}
            </div>
          </li>
          )
        })}
      </ul>
      {note && <p className="refs__note">{note}</p>}
    </section>
  )
}
