import { useCallback, useMemo, useState } from 'react'
import { content, getArea } from './content.js'
import Hero from './components/Hero.jsx'
import Hub from './components/Hub.jsx'
import TopBar from './components/TopBar.jsx'
import Sidebar from './components/Sidebar.jsx'
import AreaRoom from './components/AreaRoom.jsx'
import Chatbot from './components/Chatbot.jsx'
import './App.css'

/* =============================================================================
   App — 화면 흐름 상태기계
     view: 'intro' → 'hub' → 'area'
   상태만 여기서 관리하고, 콘텐츠는 content.js, 스타일은 *.css(토큰) 에서.
   ============================================================================= */
export default function App() {
  const [view, setView] = useState('intro') // 'intro' | 'hub' | 'area'
  const [areaId, setAreaId] = useState(null)
  const [activeQ, setActiveQ] = useState(null) // 열린 질문 id (null = 캐러셀 모드)
  const [history, setHistory] = useState([]) // [{areaId, qid}] 클릭 히스토리
  const [chatOpen, setChatOpen] = useState(false)

  const area = useMemo(() => getArea(areaId), [areaId])

  const goIntro = useCallback(() => {
    setView('intro')
    setActiveQ(null)
  }, [])

  const goHub = useCallback(() => {
    setView('hub')
    setAreaId(null)
    setActiveQ(null)
  }, [])

  const enterArea = useCallback((id) => {
    setAreaId(id)
    setActiveQ(null)
    setView('area')
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'auto' })
  }, [])

  // 질문 열기 (+ 히스토리 적재: 같은 질문은 끝으로 이동)
  const openQuestion = useCallback((qid, fromAreaId) => {
    const aId = fromAreaId || areaId
    setAreaId(aId)
    setView('area')
    setActiveQ(qid)
    setHistory((h) => {
      const filtered = h.filter((x) => !(x.areaId === aId && x.qid === qid))
      return [...filtered, { areaId: aId, qid }]
    })
  }, [areaId])

  const backToCarousel = useCallback(() => setActiveQ(null), [])

  // 채팅 스레드 안에서 '이어서 물어보기'를 누른 질문도 사이드바 히스토리에 기록
  // (activeQ는 그대로 → 스레드 리셋 없이 누적 유지)
  const recordHistory = useCallback((qid, aId) => {
    setHistory((h) => {
      const filtered = h.filter((x) => !(x.areaId === aId && x.qid === qid))
      return [...filtered, { areaId: aId, qid }]
    })
  }, [])

  const restoreHistory = useCallback((entry) => {
    setAreaId(entry.areaId)
    setActiveQ(entry.qid)
    setView('area')
  }, [])

  return (
    <div className="app-root">
      {view === 'intro' && <Hero meta={content.meta} onEnter={goHub} onBrand={goIntro} />}

      {view === 'hub' && (
        <>
          <TopBar meta={content.meta} onHome={goIntro} onHub={goHub} view={view} />
          <Hub
            meta={content.meta}
            areas={content.areas}
            onPick={enterArea}
          />
        </>
      )}

      {view === 'area' && area && (
        <>
          <TopBar meta={content.meta} onHome={goIntro} onHub={goHub} view={view} areaTitle={area.title} />
          <div className="app-stage">
            <Sidebar
              areas={content.areas}
              activeAreaId={areaId}
              history={history}
              onPickArea={enterArea}
              onPickHistory={restoreHistory}
              onHub={goHub}
            />
            <main className="app-main">
              <AreaRoom
                area={area}
                activeQ={activeQ}
                onOpenQuestion={(qid) => openQuestion(qid, area.id)}
                onRecordHistory={recordHistory}
                onBack={backToCarousel}
                meta={content.meta}
              />
            </main>
          </div>
        </>
      )}

      {/* 플로팅 큐레이션 챗봇 — 인트로 제외 전 구간 노출 */}
      {view !== 'intro' && (
        <Chatbot
          meta={content.meta}
          open={chatOpen}
          onToggle={() => setChatOpen((o) => !o)}
          onJumpToQuestion={(qid, aId) => {
            setChatOpen(false)
            openQuestion(qid, aId)
          }}
        />
      )}
    </div>
  )
}
