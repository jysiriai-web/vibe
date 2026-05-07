'use client';

import { useState } from 'react';
import type { DayData } from '@/lib/data';
import DaySection from './DaySection';

interface Props {
  days: DayData[];
}

const TAB_ALL = 'all';

export default function DayTabs({ days }: Props) {
  const [active, setActive] = useState<string>(TAB_ALL);

  const tabs = [
    { key: TAB_ALL, label: '전체' },
    ...days.map(d => ({ key: d.date, label: d.label })),
  ];

  const visibleDays = active === TAB_ALL ? days : days.filter(d => d.date === active);

  return (
    <>
      <div style={{ display: 'flex', gap: 6, marginBottom: 40 }}>
        {tabs.map(tab => {
          const isActive = active === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActive(tab.key)}
              style={{
                padding: '7px 20px', borderRadius: 100,
                border: isActive ? 'none' : '1px solid #ede9e3',
                background: isActive ? '#1a1a1a' : '#fff',
                color: isActive ? '#fff' : '#aaa',
                fontSize: 13, fontWeight: 500,
                cursor: 'pointer', transition: 'all .15s',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {visibleDays.map(day => (
        <DaySection key={day.date} day={day} />
      ))}
    </>
  );
}
