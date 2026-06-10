import { getQuestion } from '../content.js'
import QuestionCarousel from './QuestionCarousel.jsx'
import ChatThread from './ChatThread.jsx'
import ComingSoon from './ComingSoon.jsx'
import CTA from './CTA.jsx'
import ReferenceMedia from './ReferenceMedia.jsx'
import StrengthCards from './StrengthCards.jsx'
import './AreaRoom.css'

/* (2) 사업분야 상세 = "Q&A 룸"
   좌: 레퍼런스(16:9 참고) + 강점 카드 / 우: 리볼버(메인) 또는 답변.
   CTA는 헤더 우측. 질문이 열리면 좌측은 선택 질문 컨텍스트로 전환. */
export default function AreaRoom({ area, activeQ, onOpenQuestion, onBack, meta }) {
  if (area.status !== 'ready') {
    return <ComingSoon area={area} meta={meta} />
  }

  const activeQuestion = activeQ ? getQuestion(area, activeQ) : null

  // ===== 답변 뷰: 채팅 스레드 (내 질문 = 메시지, 답변 = 어시스턴트 타이핑) =====
  if (activeQuestion) {
    return <ChatThread area={area} activeQ={activeQ} meta={meta} onBack={onBack} />
  }

  // ===== 아이들 뷰: 영역 헤드라인(읽고→접기) + 레퍼런스 | 리볼버 + 강점 스트립 =====
  return (
    <div className="room" key={area.id}>
      {/* compact 헤더 — 좌: 타이틀 / 우: 협업 CTA */}
      <header className="room__head">
        <div className="room__head-text">
          <p className="room__eyebrow en label-mono">{area.hero.eyebrow}</p>
          <h1 className="room__headline" key={`h-${area.id}`}>{area.hero.headline}</h1>
          {area.hero.sub && <p className="room__sub">{area.hero.sub}</p>}
        </div>
        <CTA meta={meta} variant="mini" />
      </header>

      {/* 중앙 2단 — 좌: 레퍼런스 16:9 + 강점(세로로 채움) / 우: 리볼버(메인) */}
      <div className="room__grid">
        <div className="room__left">
          <div className="room__intro">
            <ReferenceMedia
              src={area.hero.image}
              caption={area.hero.imageCaption}
              thumbs={3}
            />
            {area.strengths?.length > 0 && (
              <div className="room__strengths">
                <StrengthCards items={area.strengths} />
              </div>
            )}
          </div>
        </div>
        <div className="room__right">
          <QuestionCarousel qna={area.qna} onPick={onOpenQuestion} />
        </div>
      </div>
    </div>
  )
}
