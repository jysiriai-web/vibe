import DeployButton from './DeployButton';

interface Props {
  totalConfirmed: number;
  byDay: { label: string; count: number }[];
}

export default function StatsHeader({ totalConfirmed, byDay }: Props) {
  return (
    <header style={{ background: '#fff', borderBottom: '1px solid #ede9e3' }}>
      <div className="max-w-6xl mx-auto px-8 py-8 flex items-end justify-between">
        {/* 타이틀 */}
        <div>
          <p style={{ fontSize: 11, letterSpacing: '0.15em', color: '#bbb', textTransform: 'uppercase', marginBottom: 6 }}>
            SIRIAI × 아이코닉무브먼트
          </p>
          <h1 style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1 }}>
            에스더버니 팝업
          </h1>
          <p style={{ fontSize: 13, color: '#aaa', marginTop: 6 }}>
            2026. 5. 1 — 5. 3 &nbsp;·&nbsp; 인스타그램 스토리 캡쳐 현황
          </p>
        </div>

        {/* 숫자 + 배포버튼 */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 16 }}>
        <DeployButton />
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 40 }}>
          {byDay.map(d => (
            <div key={d.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
              <span style={{ fontSize: 36, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1, color: '#d4cfc9' }}>
                {d.count}
              </span>
              <span style={{ fontSize: 11, color: '#ccc', letterSpacing: '0.05em' }}>{d.label}</span>
            </div>
          ))}

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
            <span style={{ fontSize: 52, fontWeight: 700, letterSpacing: '-0.04em', lineHeight: 1, color: '#C9A98A' }}>
              {totalConfirmed}
            </span>
            <span style={{ fontSize: 11, color: '#bbb', letterSpacing: '0.05em' }}>총 캡쳐</span>
          </div>
        </div>
        </div>
      </div>
      <div style={{ height: 1, background: '#f0ece6' }} />
    </header>
  );
}
