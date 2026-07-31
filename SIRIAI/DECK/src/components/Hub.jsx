import './Hub.css'

/* (1) 사업분야 선택 = Hub — "무엇을 찾고 계신가요?" + 4 카드
   카드에 마우스를 올리면 그 분야의 첫 질문이 살짝 비쳐(리볼버 예고),
   "고르면 질문부터 꺼내 드린다"는 약속을 텍스트 더하지 않고 보여준다. */
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
          const peek = ready ? area.qna?.find((q) => q.entry)?.question : null
          return (
            <button
              key={area.id}
              className={`hub-card ${ready ? 'hub-card--ready' : 'hub-card--soon'}`}
              style={{ '--i': i }}
              onClick={() => onPick(area.id)}
              aria-label={`${area.title}${ready ? '' : meta.hub.soonLabel}`}
            >
              <span className="hub-card__top">
                <span className="hub-card__no">{String(area.order).padStart(2, '0')}</span>
                {ready
                  ? <span className="hub-card__arrow" aria-hidden="true">→</span>
                  : <span className="hub-card__badge label-mono">{meta.hub.comingLabel}</span>}
              </span>

              <span className="hub-card__body">
                <span className="hub-card__title">{area.title}</span>
                <span className="hub-card__en en">{area.subtitle}</span>
                {area.cardLine && <span className="hub-card__line">{area.cardLine}</span>}
              </span>

              {/* 푸터: 평소 "들어가기" → 호버 시 첫 질문이 비친다 (같은 칸 크로스페이드) */}
              {ready && (
                <span className="hub-card__foot">
                  <span className="hub-card__foot-default label-mono">{meta.hub.enterLabel}</span>
                  {peek && <span className="hub-card__foot-peek">“{peek}”</span>}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </section>
  )
}
