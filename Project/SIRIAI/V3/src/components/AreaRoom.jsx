import { getQuestion } from '../content.js'
import QuestionCarousel from './QuestionCarousel.jsx'
import AnswerPanel from './AnswerPanel.jsx'
import ReferenceModule from './ReferenceModule.jsx'
import ComingSoon from './ComingSoon.jsx'
import CTA from './CTA.jsx'
import ImagePlaceholder from './ImagePlaceholder.jsx'
import './AreaRoom.css'

/* (2) 사업분야 상세 = "Q&A 룸" */
export default function AreaRoom({ area, activeQ, onOpenQuestion, onBack, meta }) {
  if (area.status !== 'ready') {
    return <ComingSoon area={area} meta={meta} />
  }

  const activeQuestion = activeQ ? getQuestion(area, activeQ) : null

  return (
    <div className="room">
      {/* 헤더 */}
      <header className="room__head">
        <p className="room__eyebrow en label-mono">{area.hero.eyebrow}</p>
        <h1 className="room__headline">{area.hero.headline}</h1>
        {area.hero.sub && <p className="room__sub">{area.hero.sub}</p>}
      </header>

      {/* 본문 2단: 좌 컨텍스트 / 우 질문(캐러셀) or 답변 */}
      <div className="room__grid">
        {/* 좌측 컨텍스트 패널 */}
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
              <ImagePlaceholder
                src={area.hero.image}
                alt={area.hero.imageAlt}
                caption={area.hero.imageCaption}
                ratio="3 / 4"
              />
              {area.proof?.length > 0 && (
                <ul className="room__proof">
                  {area.proof.map((p) => (
                    <li key={p.label}>
                      <span className="room__proof-v">{p.value}</span>
                      <span className="room__proof-l label-mono">{p.label}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* 우측: 캐러셀 또는 답변 */}
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

      {/* 하위 서비스 */}
      {area.services?.length > 0 && (
        <section className="room__services">
          <p className="room__section-label label-mono">함께 제공하는 것</p>
          <ul className="room__service-grid">
            {area.services.map((s) => (
              <li key={s.name} className="service-card">
                <span className="service-card__en en label-mono">{s.en}</span>
                <span className="service-card__name">{s.name}</span>
                <span className="service-card__blurb">{s.blurb}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 함께한 브랜드/사례 */}
      <ReferenceModule references={area.references} note={area.referencesNote} />

      {/* 분야 하단 CTA */}
      <CTA meta={meta} variant="band" />
    </div>
  )
}
