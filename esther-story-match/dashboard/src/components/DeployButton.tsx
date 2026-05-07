'use client';

import { useState } from 'react';

type Status = 'idle' | 'running' | 'done' | 'error';

export default function DeployButton() {
  const [status, setStatus] = useState<Status>('idle');
  const [msg, setMsg] = useState('');

  async function handleDeploy() {
    setStatus('running');
    setMsg('');

    // 포트 3002 (deploy-agent) → 3001 (review-server) 순으로 시도
    for (const port of [3002, 3001]) {
      try {
        const res = await fetch(`http://localhost:${port}/api/deploy`, {
          method: 'POST',
          signal: AbortSignal.timeout(3000),
        });
        const data = await res.json();
        setStatus(data.ok ? 'done' : 'error');
        setMsg(data.ok ? '시작됨 — 터미널 확인' : (data.error ?? '오류'));
        setTimeout(() => { setStatus('idle'); setMsg(''); }, 4000);
        return;
      } catch { /* 다음 포트 시도 */ }
    }

    setStatus('error');
    setMsg('연결 실패 — npm run agent 또는 npm run review 실행 필요');
    setTimeout(() => { setStatus('idle'); setMsg(''); }, 5000);
  }

  const label: Record<Status, string> = {
    idle:    '▶ 매칭 실행',
    running: '실행 중...',
    done:    '✓ 시작됨',
    error:   '⚠ 실패',
  };

  const colors: Record<Status, string> = {
    idle:    '#1a1a1a',
    running: '#888',
    done:    '#2d7d46',
    error:   '#c0392b',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
      <button
        onClick={handleDeploy}
        disabled={status === 'running'}
        style={{
          padding: '8px 18px',
          borderRadius: 8,
          border: `1.5px solid ${colors[status]}`,
          background: status === 'idle' ? '#1a1a1a' : '#fff',
          color: status === 'idle' ? '#fff' : colors[status],
          fontSize: 13,
          fontWeight: 600,
          cursor: status === 'running' ? 'not-allowed' : 'pointer',
          transition: 'all .15s',
          letterSpacing: '0.02em',
        }}
      >
        {label[status]}
      </button>
      {msg && (
        <span style={{ fontSize: 11, color: colors[status], maxWidth: 200, textAlign: 'right' }}>
          {msg}
        </span>
      )}
    </div>
  );
}
