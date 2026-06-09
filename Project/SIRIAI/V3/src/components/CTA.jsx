import './CTA.css'

/* 전환 CTA — variant: 'inline'(답변 말단) | 'band'(분야 하단 풀폭) | 'compact'(챗봇) */
export default function CTA({ meta, variant = 'inline' }) {
  const { cta, channels } = meta
  const mailto = `mailto:${channels.email}?subject=${encodeURIComponent('협업 제안 — SIRIAI')}`

  return (
    <div className={`cta cta--${variant}`}>
      {variant !== 'mini' && (
        <div className="cta__copy">
          <p className="cta__en en">{cta.en}</p>
          <p className="cta__kr">{cta.kr}</p>
          {variant === 'inline' && <p className="cta__sub">{cta.sub}</p>}
        </div>
      )}

      <div className="cta__actions">
        <a className="btn-pill" href={mailto}>{cta.button}</a>
        {channels.meeting && (
          <a className="btn-ghost" href={channels.meeting} target="_blank" rel="noreferrer">
            {channels.meetingLabel}
          </a>
        )}
        <a className="btn-ghost" href={channels.openchat} target="_blank" rel="noreferrer">
          1:1 오픈채팅
        </a>
      </div>
      {variant === 'inline' && (
        <p className="cta__note label-mono">{channels.openchatNote}</p>
      )}
    </div>
  )
}
