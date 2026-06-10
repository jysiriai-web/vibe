import { useEffect, useState } from 'react'
import { getQuestion } from '../content.js'
import { useTypewriter, prefersReducedMotion } from '../lib/useTypewriter.js'
import AnswerVisual from './AnswerVisual.jsx'
import CTA from './CTA.jsx'
import './AnswerPanel.css'

/* 답변 패널 — 누군가 채팅으로 답하듯 본문이 한 자씩 타이핑되고,
   다 친 뒤에 비주얼·후속질문·CTA가 차례로 나타난다. (클릭 시 타이핑 건너뛰기) */
export default function AnswerPanel({ question, area, meta, onOpenQuestion }) {
  const { answer, followUps = [], ctaLeaf } = question
  const showCta = ctaLeaf || followUps.length === 0
  const reduce = prefersReducedMotion()

  // 질문 제목이 크게→작게 접히는 동안 타이핑을 잠깐 미룬다(겹침 방지)
  const [armed, setArmed] = useState(reduce)
  useEffect(() => {
    if (reduce) { setArmed(true); return }
    setArmed(false)
    const t = setTimeout(() => setArmed(true), 560)
    return () => clearTimeout(t)
  }, [reduce, question.id])

  // 본문 → (다 치면) 보조문장 순서로 타이핑
  const body = useTypewriter(answer.body || '', { reduce, start: armed, speed: 18 })
  const hasExtra = !!answer.extra
  const extra = useTypewriter(answer.extra || '', { reduce, start: body.done, speed: 16 })

  const textDone = body.done && (!hasExtra || extra.done)
  const skipAll = () => { body.skip(); extra.skip() }

  let step = 0
  const delay = () => ({ '--d': `${step++ * 90}ms` })

  return (
    <article
      className="answer"
      key={question.id}
      onClick={!textDone ? skipAll : undefined}
      style={!textDone ? { cursor: 'pointer' } : undefined}
    >
      <p className="answer__body">
        {body.shown}
        {body.typing && <span className="type-caret" aria-hidden="true" />}
      </p>

      {hasExtra && body.done && (
        <p className="answer__extra">
          {extra.shown}
          {extra.typing && <span className="type-caret" aria-hidden="true" />}
        </p>
      )}

      {/* 타이핑이 끝난 뒤에 비주얼·후속질문·CTA 등장 */}
      {textDone && (
        <>
          {answer.visuals?.map((v, i) => (
            <div className="answer__visual reveal" style={delay()} key={i}>
              <AnswerVisual visual={v} />
            </div>
          ))}

          {followUps.length > 0 && (
            <div className="answer__follow reveal" style={delay()}>
              <p className="answer__follow-label label-mono">이어서 물어보기</p>
              <div className="answer__follow-chips">
                {followUps.map((fid) => {
                  const fq = getQuestion(area, fid)
                  if (!fq) return null
                  return (
                    <button key={fid} className="followchip" onClick={() => onOpenQuestion(fid)}>
                      {fq.question}
                      <span className="followchip__arr" aria-hidden="true">→</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {showCta && (
            <div className="answer__cta reveal" style={delay()}>
              <CTA meta={meta} variant="inline" />
            </div>
          )}
        </>
      )}
    </article>
  )
}
