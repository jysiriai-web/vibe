import './Hub.css'

/* (1) 사업분야 선택 = Hub — "무엇을 찾고 계신가요?" + 4 카드 */
export default function Hub({ meta, areas, onPick }) {
  return (
    <section className="hub">
      <div className="hub__head">
        <p className="hub__eyebrow label-mono">{meta.hub.eyebrow}</p>
        <h2 className="hub__title">{meta.hub.title}</h2>
        <p className="hub__sub">{meta.hub.sub}</p>
      </div>

      <div className="hub__grid">
        {areas.map((area, i) => {
          const ready = area.status === 'ready'
          return (
            <button
              key={area.id}
              className={`hub-card ${ready ? 'hub-card--ready' : 'hub-card--soon'}`}
              style={{ '--i': i }}
              onClick={() => onPick(area.id)}
              aria-label={`${area.title}${ready ? '' : meta.hub.soonLabel}`}
            >
              <span className="hub-card__no">{String(area.order).padStart(2, '0')}</span>
              <span className="hub-card__body">
                <span className="hub-card__title">{area.title}</span>
                <span className="hub-card__en en">{area.subtitle}</span>
                {area.cardLine && <span className="hub-card__line">{area.cardLine}</span>}
              </span>
              <span className={`hub-card__foot label-mono ${ready ? '' : 'hub-card__badge'}`}>
                {ready ? meta.hub.enterLabel : meta.hub.comingLabel}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
