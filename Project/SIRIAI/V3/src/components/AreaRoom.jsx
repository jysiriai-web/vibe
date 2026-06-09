import { getQuestion } from '../content.js'
import QuestionCarousel from './QuestionCarousel.jsx'
import AnswerPanel from './AnswerPanel.jsx'
import ComingSoon from './ComingSoon.jsx'
import CTA from './CTA.jsx'
import ImagePlaceholder from './ImagePlaceholder.jsx'
import './AreaRoom.css'

/* (2) 사업분야 상세 = 한 화면 "Q&A 룸"
   목표: 스크롤 없이 1뷰포트에 담긴다 (헤드 compact · 중앙 2단이 높이를 채움 · 슬림 푸터).
   레퍼런스는 큰 모듈 대신 한 줄 브랜드 크레딧으로 압축. */
export default function AreaRoom({ area, activeQ, onOpenQuestion, onBack, meta }) {
  if (area.status !== 'ready') {
    return <ComingSoon area={area} meta={meta} />
  }

  const activeQuestion = activeQ ? getQuestion(area, activeQ) : null

  // 레퍼런스 → 동의 게이트 반영한 표시명만 추려 한 줄 크레딧으로
  const brands = (area.references || []).map((r) =>
    r.consent === 'ok' || r.consent === 'confidential' ? r.brand : r.displayBrand || r.group || r.brand
  )

  return (
    <div className="room">
      {/* compact 헤더 */}
      <header className="room__head">
        <p className="room__eyebrow en label-mono">{area.hero.eyebrow}</p>
        <h1 className="room__headline">{area.hero.headline}</h1>
        {area.hero.sub && <p className="room__sub">{area.hero.sub}</p>}
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
              <ImagePlaceholder
                src={area.hero.image}
                alt={area.hero.imageAlt}
                caption={area.hero.imageCaption}
                ratio="4 / 3"
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

      {/* 슬림 푸터: 브랜드 크레딧 · CTA. 질문이 열리면 숨겨 답변에 공간을 준다. */}
      {!activeQuestion && (
        <footer className="room__foot">
          {brands.length > 0 && (
            <p className="room__brands label-mono">
              함께한 브랜드 · {brands.slice(0, 6).join(' · ')}
            </p>
          )}
          <CTA meta={meta} variant="band" />
        </footer>
      )}
    </div>
  )
}
