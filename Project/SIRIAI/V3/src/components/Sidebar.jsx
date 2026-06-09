import { getArea, getQuestion } from '../content.js'
import './Sidebar.css'

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
                    className={`sidebar__area ${active ? 'is-active' : ''} ${ready ? '' : 'is-soon'}`}
                    onClick={() => onPickArea(area.id)}
                  >
                    <span className="sidebar__area-no label-mono">
                      {String(area.order).padStart(2, '0')}
                    </span>
                    <span className="sidebar__area-title">{area.title}</span>
                    {!ready && <span className="sidebar__area-dot" aria-hidden="true" />}
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
