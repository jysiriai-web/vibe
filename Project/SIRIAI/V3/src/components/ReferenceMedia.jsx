import './ReferenceMedia.css'

/* 레퍼런스 미디어 — 16:9 메인 1개 + 하단 썸네일 스트립.
   실제 영상/이미지가 오면 main/thumbs에 경로를 넣으면 된다. 지금은 가상(목업). */
export default function ReferenceMedia({ src, caption, thumbs = 3 }) {
  return (
    <figure className="refmedia">
      <div className="refmedia__main">
        {src ? <img src={src} alt="레퍼런스 영상" /> : <div className="refmedia__ph" />}
        <span className="refmedia__badge label-mono">레퍼런스</span>
      </div>
      <div className="refmedia__strip">
        {Array.from({ length: thumbs }).map((_, i) => (
          <button className="refmedia__thumb" key={i} aria-label={`레퍼런스 ${i + 1}`}>
            <span className="refmedia__play" aria-hidden="true" />
          </button>
        ))}
      </div>
      {caption && <figcaption className="refmedia__cap label-mono">{caption}</figcaption>}
    </figure>
  )
}
