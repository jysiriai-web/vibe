'use client';

import { useState } from 'react';
import type { MasterPerson } from '@/lib/data';
import PersonCard from './PersonCard';

interface Props {
  people: MasterPerson[];
}

export default function CollapsibleUnuploaded({ people }: Props) {
  const [open, setOpen] = useState(false);
  if (people.length === 0) return null;

  return (
    <div style={{ marginTop: 24 }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 14px',
          border: '1px solid #ede9e3',
          borderRadius: 100,
          background: '#fff',
          cursor: 'pointer',
          fontSize: 12, color: '#aaa', fontWeight: 500,
          letterSpacing: '0.04em',
          transition: 'all .15s',
        }}
      >
        <span>미업로드 {people.length}명</span>
        <span style={{
          display: 'inline-block',
          transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform .2s',
        }}>▼</span>
      </button>

      {open && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 12,
          marginTop: 16,
        }}>
          {people.map(p => (
            <PersonCard
              key={p.id}
              name={p.name}
              handle={p.handle}
              type={p.type}
              state="unuploaded"
            />
          ))}
        </div>
      )}
    </div>
  );
}
