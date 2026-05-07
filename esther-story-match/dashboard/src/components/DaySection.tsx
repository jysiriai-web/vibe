import type { DayData } from '@/lib/data';
import PersonCard from './PersonCard';

interface Props {
  day: DayData;
}

export default function DaySection({ day }: Props) {
  return (
    <section style={{ marginBottom: 56 }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 10,
        marginBottom: 20, paddingBottom: 14,
        borderBottom: '1px solid #ede9e3',
      }}>
        <h2 style={{ fontSize: 20, fontWeight: 600 }}>{day.label}</h2>
        <span style={{ fontSize: 13, color: '#bbb' }}>{day.confirmed.length}건</span>
      </div>

      {day.confirmed.length === 0 ? (
        <p style={{ fontSize: 13, color: '#ccc' }}>캡쳐 없음</p>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 12,
        }}>
          {day.confirmed.map(p => (
            <PersonCard
              key={p.id}
              name={p.name}
              handle={p.handle}
              type={p.type}
              captureFile={p.capture_file}
              state="uploaded"
            />
          ))}
        </div>
      )}
    </section>
  );
}
