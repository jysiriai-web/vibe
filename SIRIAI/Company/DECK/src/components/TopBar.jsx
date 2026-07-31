import './TopBar.css'

/* 슬림 상단 바 — 워드마크(→인트로) + 허브 이동 + 현재 분야 표기 */
export default function TopBar({ meta, onHome, onHub, view, areaTitle }) {
  return (
    <header className="topbar">
      <button className="topbar__brand" onClick={onHome} aria-label="처음으로">
        <span className="topbar__wordmark label-mono">{meta.wordmark}</span>
        <span className="jp topbar__jp">{meta.jp}</span>
      </button>

      <nav className="topbar__crumbs label-mono" aria-label="위치">
        <button className="topbar__crumb" onClick={onHub}>사업분야</button>
        {view === 'area' && areaTitle && (
          <>
            <span className="topbar__sep" aria-hidden="true">/</span>
            <span className="topbar__crumb topbar__crumb--current">{areaTitle}</span>
          </>
        )}
      </nav>
    </header>
  )
}
