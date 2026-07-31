import './ImagePlaceholder.css'

/* 이미지 자리 — 실사진이 있으면 렌더, 없으면 '디자인된 비주얼 플레이트'(웜워시+캡션).
   (claude.ai/Figma 단계에서 실사진으로 교체) */
export default function ImagePlaceholder({ src, alt, caption, ratio = '3 / 4' }) {
  if (src) {
    return (
      <figure className="imgph imgph--real" style={{ aspectRatio: ratio }}>
        <img src={src} alt={alt || ''} />
        {caption && <figcaption className="imgph__cap">{caption}</figcaption>}
      </figure>
    )
  }
  return (
    <figure className="imgph imgph--plate" style={{ aspectRatio: ratio }}>
      <div className="imgph__frame">
        <span className="imgph__mark label-mono">Visual</span>
        <span className="imgph__icon" aria-hidden="true">
          <svg viewBox="0 0 64 64" width="56" height="56" fill="none"
            stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <rect x="8" y="8" width="48" height="48" rx="10" />
            <circle cx="32" cy="26" r="8" />
            <path d="M16 52c3-9 9-13 16-13s13 4 16 13" />
          </svg>
        </span>
        <span className="imgph__alt">{alt}</span>
        {caption && <span className="imgph__cap">{caption}</span>}
      </div>
    </figure>
  )
}
