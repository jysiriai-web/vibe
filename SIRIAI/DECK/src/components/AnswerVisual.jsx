/* 답변 비주얼 렌더러 — visual.type 으로 추상화
   지원: 'diagram' | 'process' | 'stat' | 'list' | 'compare' | 'note' */
export default function AnswerVisual({ visual }) {
  switch (visual.type) {
    case 'diagram':
      return (
        <figure className="av-diagram">
          <img src={visual.src} alt={visual.alt || ''} loading="lazy" />
          {visual.caption && <figcaption className="av-cap">{visual.caption}</figcaption>}
        </figure>
      )

    case 'process':
      return (
        <ol className="av-process" aria-label="진행 단계">
          {visual.items.map((step, i) => (
            <li key={i} className="av-process__step">
              <span className="av-process__no label-mono">{String(i + 1).padStart(2, '0')}</span>
              <span className="av-process__label">{step}</span>
            </li>
          ))}
        </ol>
      )

    case 'stat':
      return (
        <ul className="av-stat">
          {visual.items.map((s, i) => (
            <li key={i}>
              <span className="av-stat__v">{s.value}</span>
              <span className="av-stat__l label-mono">{s.label}</span>
            </li>
          ))}
        </ul>
      )

    case 'list':
      return (
        <div className="av-list">
          {visual.title && <p className="av-list__title label-mono">{visual.title}</p>}
          <ul>
            {visual.items.map((it, i) => (
              <li key={i}>{it}</li>
            ))}
          </ul>
        </div>
      )

    case 'compare':
      return (
        <div className="av-compare">
          {[visual.left, visual.right].map((col, c) => (
            <div key={c} className={`av-compare__col ${c === 1 ? 'is-ours' : ''}`}>
              <p className="av-compare__title label-mono">{col.title}</p>
              <ul>
                {col.items.map((it, i) => (
                  <li key={i}>{it}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )

    case 'note':
      return <p className="av-note">{visual.text}</p>

    default:
      return null
  }
}
