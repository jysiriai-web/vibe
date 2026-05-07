interface Props {
  name: string;
  handle: string | null;
  type: '인플루언서' | '동행자';
  captureFile?: string;
  state: 'uploaded' | 'unuploaded';
}

function toImgSrc(captureFile: string): string {
  // 백슬래시 → 슬래시 정규화, captures/ 접두사 제거
  const normalized = captureFile.replace(/\\/g, '/').replace(/^captures\//, '');
  return `/captures/${normalized}`;
}

export default function PersonCard({ name, handle, type, captureFile, state }: Props) {
  const isUploaded   = state === 'uploaded';
  const isInfluencer = type === '인플루언서';

  return (
    <div style={{
      borderRadius: 16,
      overflow: 'hidden',
      border: `1px solid ${isUploaded ? '#ede9e3' : '#f0ece6'}`,
      background: isUploaded ? '#fff' : '#faf8f5',
      opacity: isUploaded ? 1 : 0.45,
      transition: 'box-shadow .2s, transform .2s',
      boxShadow: isUploaded ? '0 1px 4px rgba(0,0,0,0.04)' : 'none',
    }}>
      {/* 이미지 */}
      <div style={{
        position: 'relative',
        aspectRatio: '9/16',
        background: '#f0ece6',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {isUploaded && captureFile ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={toImgSrc(captureFile)}
            alt={handle ?? name}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <span style={{ fontSize: 11, color: '#ccc' }}>미업로드</span>
        )}

        {/* 뱃지 */}
        <span style={{
          position: 'absolute', top: 8, left: 8,
          fontSize: 10, fontWeight: 700,
          padding: '2px 8px',
          borderRadius: 20,
          background: isInfluencer ? '#C9A98A' : 'rgba(255,255,255,0.85)',
          color: isInfluencer ? '#fff' : '#888',
          backdropFilter: isInfluencer ? 'none' : 'blur(4px)',
          letterSpacing: '0.04em',
        }}>
          {type}
        </span>
      </div>

      {/* 정보 */}
      <div style={{ padding: '10px 12px 12px' }}>
        <p style={{
          fontSize: 14, fontWeight: 600, lineHeight: 1.3,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {name}
        </p>
        {handle && (
          <p style={{
            fontSize: 12, color: '#bbb', fontFamily: 'monospace',
            marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            @{handle}
          </p>
        )}
      </div>
    </div>
  );
}
