import { getArea, getQuestion } from '../content.js'
import './Sidebar.css'

/* 분야별 라인 아이콘 (애플뮤직식 아이콘+라벨 목차) */
const ICONS = {
  influencer: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19.5c0-3.3 2.5-5.5 5.5-5.5s5.5 2.2 5.5 5.5" />
      <path d="M16 5.5a2.6 2.6 0 0 1 0 5" />
      <path d="M17.5 14.2c2 .5 3.5 2.3 3.5 4.8" />
    </svg>
  ),
  architecting: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20 12 4l8 16" />
      <path d="M7.4 13.2h9.2" />
      <circle cx="12" cy="4" r="0.6" fill="currentColor" />
    </svg>
  ),
  saai: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 8.5 5 12l4 3.5" />
      <path d="M15 8.5 19 12l-4 3.5" />
      <path d="M13 6.5l-2 11" />
    </svg>
  ),
  pb: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3.2l2.3 6.5 6.5 2.3-6.5 2.3L12 20.8l-2.3-6.5L3.2 12l6.5-2.3z" />
    </svg>
  ),
}

/* 좌측 사이드바(고정): 상단 전체 목차(4분야) + 하단 "눌렀던 질문" 히스토리 */
export default function Sidebar({ areas, activeAreaId, history, onPickArea, onPickHistory, onHub }) {
  return (
    <aside className="sidebar">
      <div className="sidebar__sticky">
        <nav className="sidebar__nav" aria-label="사업분야 목차">
          <p className="sidebar__label label-mono">사업분야</p>
          <ul>
            {areas.map((area) => {
              const ready = area.status === 'ready'
              const active = area.id === activeAreaId
              return (
                <li key={area.id}>
                  <button
                    className={`sidebar__area ${active ? 'is-active' : ''} ${ready ? '' : 'is-locked'}`}
                    onClick={ready ? () => onPickArea(area.id) : undefined}
                    disabled={!ready}
                    aria-disabled={!ready}
                    title={ready ? undefined : '준비 중 — 2026 공개 예정'}
                  >
                    <span className="sidebar__area-icon" aria-hidden="true">{ICONS[area.id]}</span>
                    <span className="sidebar__area-title">{area.title}</span>
                    {!ready && <span className="sidebar__area-lock label-mono">2026</span>}
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>

        <div className="sidebar__history" aria-label="내가 눌렀던 질문">
          <p className="sidebar__label label-mono">내가 눌렀던 질문</p>
          {history.length === 0 ? (
            <p className="sidebar__empty">질문을 누르면 여기에 쌓여요.</p>
          ) : (
            <ul>
              {[...history].reverse().map((entry, i) => {
                const a = getArea(entry.areaId)
                const q = getQuestion(a, entry.qid)
                if (!q) return null
                return (
                  <li key={`${entry.areaId}-${entry.qid}-${i}`}>
                    <button className="sidebar__hist" onClick={() => onPickHistory(entry)}>
                      <span className="sidebar__hist-q">{q.question}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </aside>
  )
}
