import { useEffect, useMemo, useRef, useState } from 'react'
import { allQuestions, getArea } from '../content.js'
import CTA from './CTA.jsx'
import './Chatbot.css'

/* 시리아이 어시스턴트 마크 (4-포인트 스파크 — 정체성 아바타) */
function BotMark() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
      <path d="M12 2 L13.7 9.1 L21 11 L13.7 12.9 L12 20 L10.3 12.9 L3 11 L10.3 9.1 Z" fill="currentColor" />
    </svg>
  )
}

/* 우하단 플로팅 큐레이션 챗봇 (진짜 LLM 아님 — content의 Q&A 매칭).
   입력/선택 → 등록 질문 매칭 → 채팅 버블. 매칭 없으면 추천 + 문의 CTA. */
export default function Chatbot({ meta, open, onToggle, onJumpToQuestion }) {
  const pool = useMemo(() => allQuestions(), [])
  const entryQs = useMemo(() => pool.filter((q) => q.entry).slice(0, 4), [pool])

  const greet = useMemo(
    () => ({ role: 'bot', text: meta.chatbot.greeting, suggestions: entryQs.map((q) => q.id) }),
    [meta, entryQs]
  )
  const [messages, setMessages] = useState([greet])
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)
  const bodyRef = useRef(null)
  const timerRef = useRef(null)

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight
  }, [messages, typing, open])

  useEffect(() => () => clearTimeout(timerRef.current), [])

  const byId = (id) => pool.find((q) => q.id === id)

  // 키워드/질문문 매칭 스코어
  // ★ 키워드가 최소 1개는 일치해야 후보로 인정 → 한글 글자 우연 겹침으로
  //   엉뚱한 답이 매칭되는 false positive 방지. 글자 겹침은 후보 간 tiebreaker로만.
  const match = (text) => {
    const t = text.toLowerCase().replace(/\s/g, '')
    let best = null
    let bestScore = 0
    for (const q of pool) {
      let kw = 0
      for (const k of q.keywords || []) {
        if (t.includes(k.toLowerCase())) kw += 2
      }
      if (kw === 0) continue // 키워드 미일치 → fallback로
      let score = kw
      const qt = q.question.toLowerCase().replace(/[\s?]/g, '')
      for (const ch of new Set(qt)) if (t.includes(ch)) score += 0.05
      if (score > bestScore) { bestScore = score; best = q }
    }
    return best
  }

  const botAnswer = (q) => {
    const a = q.answer
    const text = a.extra ? `${a.body}\n\n${a.extra}` : a.body
    const followSug = (q.followUps || []).slice(0, 3)
    const leaf = q.ctaLeaf || (q.followUps || []).length === 0
    return {
      role: 'bot',
      text,
      qid: q.id,
      areaId: q.areaId,
      suggestions: followSug,
      cta: leaf,
    }
  }

  const pushBot = (msg) => {
    setTyping(true)
    timerRef.current = setTimeout(() => {
      setTyping(false)
      setMessages((m) => [...m, msg])
    }, 560)
  }

  const ask = (text) => {
    const clean = text.trim()
    if (!clean) return
    setMessages((m) => [...m, { role: 'user', text: clean }])
    setInput('')
    const q = match(clean)
    if (q) pushBot(botAnswer(q))
    else
      pushBot({
        role: 'bot',
        text: meta.chatbot.fallback,
        suggestions: entryQs.map((x) => x.id),
        escalate: true, // 특이 질문 → 사람(담당자)에게 바로 연결
      })
  }

  const pickSuggestion = (qid) => {
    const q = byId(qid)
    if (!q) return
    setMessages((m) => [...m, { role: 'user', text: q.question }])
    pushBot(botAnswer(q))
  }

  const { channels } = meta
  const mailto = `mailto:${channels.email}?subject=${encodeURIComponent('문의 — SIRIAI')}`

  return (
    <div className={`bot ${open ? 'is-open' : ''}`}>
      {open && (
        <div className="bot__panel" role="dialog" aria-label="시리아이에게 물어보기">
          <header className="bot__head">
            <div className="bot__head-id">
              <span className="bot__avatar bot__avatar--lg"><BotMark /></span>
              <div>
                <p className="bot__title">
                  {meta.chatbot.title}
                  <span className="bot__status"><i className="bot__dot" />응답 가능</span>
                </p>
                <p className="bot__subtitle label-mono">{meta.chatbot.subtitle}</p>
              </div>
            </div>
            <button className="bot__close" onClick={onToggle} aria-label="닫기">✕</button>
          </header>

          <div className="bot__body" ref={bodyRef}>
            {messages.map((m, i) => (
              <div key={i} className={`bubble-row bubble-row--${m.role}`}>
                <div className="bubble-line">
                  {m.role === 'bot' && <span className="bot__avatar"><BotMark /></span>}
                  <div className={`bubble bubble--${m.role}`}>
                    <p className="bubble__text">{m.text}</p>
                    {m.qid && m.areaId && (
                      <button
                        className="bubble__jump label-mono"
                        onClick={() => onJumpToQuestion(m.qid, m.areaId)}
                      >
                        이 분야에서 자세히 보기 →
                      </button>
                    )}
                    {m.escalate && (
                      <div className="bubble__escalate">
                        <a className="escalate-btn" href={channels.openchat} target="_blank" rel="noreferrer">
                          <BotMark />
                          {meta.chatbot.escalateLabel}
                        </a>
                        <a className="escalate-alt label-mono" href={mailto}>이메일로 남기기</a>
                      </div>
                    )}
                    {m.cta && (
                      <div className="bubble__cta">
                        <CTA meta={meta} variant="compact" />
                      </div>
                    )}
                  </div>
                </div>
                {m.suggestions?.length > 0 && (
                  <div className="bot__sugs">
                    {m.role === 'bot' && i === 0 && (
                      <p className="bot__sugs-label label-mono">{meta.chatbot.suggestLabel}</p>
                    )}
                    {m.suggestions.map((sid) => {
                      const sq = byId(sid)
                      if (!sq) return null
                      return (
                        <button key={sid} className="sug" onClick={() => pickSuggestion(sid)}>
                          {sq.question}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}
            {typing && (
              <div className="bubble-row bubble-row--bot">
                <div className="bubble-line">
                  <span className="bot__avatar"><BotMark /></span>
                  <div className="bubble bubble--bot bubble--typing">
                    <span /><span /><span />
                  </div>
                </div>
              </div>
            )}
          </div>

          <form
            className="bot__input"
            onSubmit={(e) => { e.preventDefault(); ask(input) }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={meta.chatbot.placeholder}
              aria-label="질문 입력"
            />
            <button type="submit" className="bot__send" aria-label="보내기">→</button>
          </form>
        </div>
      )}

      <button className={`bot__fab ${open ? 'is-open' : ''}`} onClick={onToggle} aria-label="시리아이에게 물어보기">
        {open ? '✕' : (
          <>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.4 8.5 8.5 0 0 1-3.9-.9L3 21l1.9-5.6A8.38 8.38 0 0 1 4 11.5 8.5 8.5 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5z" />
            </svg>
            <span className="bot__fab-dot" aria-hidden="true" />
          </>
        )}
      </button>
    </div>
  )
}
