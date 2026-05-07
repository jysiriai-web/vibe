import type { NoMatchItem } from '@/lib/data';

function toImgSrc(captureFile: string): string {
  const normalized = captureFile.replace(/\\/g, '/').replace(/^captures\//, '');
  return `/captures/${normalized}`;
}

interface Props {
  items: NoMatchItem[];
}

export default function NoMatchSection({ items }: Props) {
  if (items.length === 0) return null;

  return (
    <section style={{ marginBottom: 64 }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 12,
        marginBottom: 20, paddingBottom: 16,
        borderBottom: '1px solid #ede9e3',
      }}>
        <h2 style={{ fontSize: 20, fontWeight: 600 }}>매칭 실패 캡쳐</h2>
        <span style={{ fontSize: 13, color: '#bbb' }}>마스터 리스트 미등록 계정 · {items.length}건</span>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 12,
      }}>
        {items.map((item, i) => (
          <div key={i} style={{
            borderRadius: 16, overflow: 'hidden',
            border: '1px solid #ede9e3', background: '#fff',
          }}>
            <div style={{
              position: 'relative', aspectRatio: '9/16',
              background: '#faf8f5', overflow: 'hidden',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {item.capture_file ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={toImgSrc(item.capture_file)}
                  alt="unmatched"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <span style={{ fontSize: 11, color: '#ccc' }}>이미지 없음</span>
              )}
              <span style={{
                position: 'absolute', top: 8, left: 8,
                fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                background: 'rgba(220,80,60,0.08)', color: '#e05540',
              }}>
                미확인
              </span>
            </div>
            <div style={{ padding: '10px 12px 12px' }}>
              <p style={{ fontSize: 12, fontFamily: 'monospace', color: '#bbb' }}>
                {item.extracted_handle ? `@${item.extracted_handle}` : '식별 불가'}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
