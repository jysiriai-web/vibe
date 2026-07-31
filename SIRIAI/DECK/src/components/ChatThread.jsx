import { useEffect, useRef, useState } from 'react'
import { getQuestion } from '../content.js'
import { useTypewriter, prefersReducedMotion } from '../lib/useTypewriter.js'
import AnswerVisual from './AnswerVisual.jsx'
import CTA from './CTA.jsx'
import './ChatThread.css'

/* 시리아이 어시스턴트 마크 (스파크) */
function Spark() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
      <path d="M12 2 L13.7 9.1 L21 11 L13.7 12.9 L12 20 L10.3 12.9 L3 11 L10.3 9.1 Z" fill="currentColor" />
    </svg>
  )
}

/* 한 번의 주고받음 = 내 질문 버블(우) + 어시스턴트 답변 버블(좌, 타이핑).
   animate=true(가장 최근에 추가된 것)일 때만 타이핑, 나머지는 즉시 전체 노출.
   live는 마운트 시 한 번 고정 → 새 교환이 추가돼도 과거 교환은 다시 타이핑되지 않음. */
function Exchange({ q, area, meta, animate, onFollow }) {
  const reduce = prefersReducedMotion()
  const [live] = useState(animate && !reduce)
  const { answer, followUps = [], ctaLeaf } = q

  const body = useTypewriter(answer.body || '', { reduce, start: live, speed: 18 })
  const hasExtra = !!answer.extra
  const extra = useTypewriter(answer.extra || '', { reduce, start: live && body.done, speed: 16 })

  const bodyShown = live ? body.shown : answer.body || ''
  const extraShown = live ? extra.shown : answer.extra || ''
  const extraReady = !live || body.done
  const textDone = !live || (body.done && (!hasExtra || extra.done))
  const skip = () => { body.skip(); extra.skip() }

  const showCta = ctaLeaf || followUps.length === 0

  let step = 0
  const delay = () => ({ '--d': `${step++ * 90}ms` })

  return (
    <div className="chatx">
      {/* 내 질문 (오른쪽) */}
      <div className="chatx__row chatx__row--user">
        <div className="chatx__bubble chatx__bubble--user">{q.question}</div>
      </div>

      {/* 어시스턴트 답변 (왼쪽, 아바타) */}
      <div className="chatx__row chatx__row--bot">
        <span className="chatx__avatar"><Spark /></span>
        <div
          className="chatx__bubble chatx__bubble--bot"
          onClick={!textDone ? skip : undefined}
          style={!textDone ? { cursor: 'pointer' } : undefined}
        >
          <p className="chatx__text">
            {bodyShown}
            {live && body.typing && <span className="type-caret" aria-hidden="true" />}
          </p>
          {hasExtra && extraReady && (
            <p className="chatx__extra">
              {extraShown}
              {live && extra.typing && <span className="type-caret" aria-hidden="true" />}
            </p>
          )}
          {textDone && answer.visuals?.map((v, i) => (
            <div className="chatx__visual reveal" style={delay()} key={i}>
              <AnswerVisual visual={v} />
            </div>
          ))}
        </div>
      </div>

      {/* 이어서 물어보기 — 답변이 끝난 뒤, 대화가 이어진다 */}
      {textDone && followUps.length > 0 && (
        <div className="chatx__follow reveal" style={delay()}>
          <p className="chatx__follow-label label-mono">이어서 물어보기</p>
          <div className="chatx__chips">
            {followUps.map((fid) => {
              const fq = getQuestion(area, fid)
              if (!fq) return null
              return (
                <button key={fid} className="chatchip" onClick={() => onFollow(fid)}>
                  {fq.question}
                  <span className="chatchip__arr" aria-hidden="true">→</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {textDone && showCta && (
        <div className="chatx__cta reveal" style={delay()}>
          <CTA meta={meta} variant="compact" />
        </div>
      )}
    </div>
  )
}

/* 답변 화면 = 채팅 스레드. 내가 누른 질문이 그대로 첫 메시지가 되고,
   이어서 물어보기를 누르면 같은 대화에 새 주고받음이 쌓인다(연속적 경험).
   헤더는 상단에 고정, 콘텐츠는 위에서부터 흐른다(중앙정렬 X). */
export default function ChatThread({ area, activeQ, meta, onBack, onRecordHistory }) {
  const [thread, setThread] = useState(() => (activeQ ? [activeQ] : []))
  const prev = useRef(activeQ)
  const lenRef = useRef(thread.length)
  const threadRef = useRef(null)

  // 외부(리볼버/사이드바)에서 질문이 바뀌면 새 대화로 리셋 + 맨 위로
  useEffect(() => {
    if (activeQ && activeQ !== prev.current) {
      setThread([activeQ])
      lenRef.current = 1
      if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'auto' })
    }
    prev.current = activeQ
  }, [activeQ])

  // 이어서 물어보기 → 같은 스레드에 누적(네비게이션 X) + 사이드바 히스토리에도 기록
  const append = (qid) => {
    setThread((t) => (t.includes(qid) ? t : [...t, qid]))
    onRecordHistory?.(qid, area.id)
  }

  // 새 교환이 쌓이면, 그 질문을 화면 최상단으로 올린다(이전 질문은 위로 스크롤해 확인)
  useEffect(() => {
    if (thread.length > lenRef.current && threadRef.current) {
      const items = threadRef.current.querySelectorAll('.chatx')
      const last = items[items.length - 1]
      if (last) last.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    lenRef.current = thread.length
  }, [thread])

  return (
    <div className="chat">
      <header className="chat__head">
        <button className="chat__back" onClick={onBack}>← 질문 더 보기</button>
        <div className="chat__id">
          <span className="chat__id-avatar"><Spark /></span>
          <div className="chat__id-text">
            <p className="chat__id-name">
              {area.title}
              <span className="chat__id-status"><i className="chat__dot" />응답 중</span>
            </p>
            <p className="chat__id-sub label-mono en">{area.subtitle}</p>
          </div>
        </div>
      </header>

      <div className={`chat__thread ${thread.length > 1 ? 'is-multi' : ''}`} ref={threadRef}>
        {thread.map((qid, i) => {
          const q = getQuestion(area, qid)
          if (!q) return null
          return (
            <Exchange
              key={qid}
              q={q}
              area={area}
              meta={meta}
              animate={i === thread.length - 1}
              onFollow={append}
            />
          )
        })}
      </div>
    </div>
  )
}
