import './StrengthCards.css'

/* 강점 카드 — 숫자 나열 대신 마우스오버 시 설명이 떠오르는 '특성' 카드 (게임 스탯 느낌) */
export default function StrengthCards({ items }) {
  if (!items?.length) return null
  return (
    <ul className="strengths">
      {items.map((s, i) => (
        <li className="strength" key={i} tabIndex={0}>
          <span className="strength__v en">{s.value}</span>
          <span className="strength__l">{s.label}</span>
          <span className="strength__reveal">
            <span className="strength__d">{s.detail}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}
