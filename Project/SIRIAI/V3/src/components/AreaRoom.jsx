import { getQuestion } from '../content.js'
import QuestionCarousel from './QuestionCarousel.jsx'
import AnswerPanel from './AnswerPanel.jsx'
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

  return (
    <div className="room">
      {/* compact 헤더 — 좌: 타이틀 / 우: 협업 CTA */}
      <header className="room__head">
        <div className="room__head-text">
          <p className="room__eyebrow en label-mono">{area.hero.eyebrow}</p>
          <h1 className="room__headline">{area.hero.headline}</h1>
          {area.hero.sub && <p className="room__sub">{area.hero.sub}</p>}
        </div>
        <CTA meta={meta} variant="mini" />
      </header>

      {/* 중앙 2단 — 남은 높이를 채운다 (idle=중앙정렬 / 답변=상단정렬) */}
      <div className={`room__grid ${activeQuestion ? 'is-answer' : ''}`}>
        {/* 좌: 비주얼 + 검증수치 (질문 열리면 선택 질문 컨텍스트) */}
        <div className="room__left">
          {activeQuestion ? (
            <div className="room__context" key={activeQuestion.id}>
              <p className="room__context-label label-mono">선택한 질문</p>
              <p className="room__context-q">{activeQuestion.question}</p>
              <button className="room__back" onClick={onBack}>
                ← 질문 더 보기
              </button>
            </div>
          ) : (
            <div className="room__intro">
              <ReferenceMedia
                src={area.hero.image}
                caption={area.hero.imageCaption}
                thumbs={3}
              />
              <StrengthCards items={area.strengths} />
            </div>
          )}
        </div>

        {/* 우: 리볼버 또는 답변 */}
        <div className="room__right">
          {activeQuestion ? (
            <AnswerPanel
              question={activeQuestion}
              area={area}
              meta={meta}
              onOpenQuestion={onOpenQuestion}
            />
          ) : (
            <QuestionCarousel qna={area.qna} onPick={onOpenQuestion} />
          )}
        </div>
      </div>
    </div>
  )
}
