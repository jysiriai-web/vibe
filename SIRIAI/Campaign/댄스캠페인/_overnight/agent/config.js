// 스캔 에이전트 설정 로더 (의존성 0).
// 우선순위: 환경변수 > agent.config.json > 기본값.
// agent.config.json 은 선택. 없으면 로컬 큐 + 저녁 예약(19:30/21:30) 기본으로 바로 돈다.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const HERE_DIR = dirname(fileURLToPath(import.meta.url));   // .../Garden/_overnight/agent
export const AGENT_DATA = join(HERE_DIR, '_data');                 // 큐·하트비트·로그 (gitignore)
const CFG_FILE = join(HERE_DIR, 'agent.config.json');

const DEFAULTS = {
  // 신호버스: 'local' = 로컬 파일 큐(설치 0, 기본). 'sheet' = worker_bus.gs 웹앱 폴링(클라우드 연동 옵션).
  bus: 'local',
  sheet: { url: '', token: '' }, // bus:'sheet' 일 때 worker_bus.gs 로 배포한 별도 웹앱
  // 127.0.0.1 전용 상태·온디맨드 서버 포트(0 이면 끔). 브라우저 북마크로 상태/스캔요청.
  controlPort: 3939,
  idlePollMs: 10000,             // 유휴 폴링 간격
  activePollMs: 2500,            // 스캔/인증대기/막힘 중 폴링 간격(감독 지연 최소화)
  progressThrottleMs: 10000,     // 진행률을 버스에 쓰는 스로틀(시트 모드 쿼터 보호)
  campaigns: 'all',             // 'all' | ['bayonn', ...] — 저녁 예약이 스캔할 캠페인
  schedule: {
    enabled: true,
    windows: ['19:30', '21:30'], // 저녁 시간창(무인). 각 창은 하루 1회, 최대 60분 캐치업.
    mode: 'upload',              // 'upload'(미업로드만) | 'full'(전체 재스캔) | 'perf'(조회수)
    graceMs: 60000,              // 무인 워밍업 자동 진행 유예 — 쿠키 살아있으면 더 빨리 통과, 막히면 접음
  },
};

export function loadConfig() {
  let file = {};
  if (existsSync(CFG_FILE)) {
    try { file = JSON.parse(readFileSync(CFG_FILE, 'utf8')); }
    catch (e) { console.error('[config] agent.config.json 파싱 실패 → 기본값 사용:', e.message); }
  }
  const c = {
    ...DEFAULTS, ...file,
    sheet: { ...DEFAULTS.sheet, ...(file.sheet || {}) },
    schedule: { ...DEFAULTS.schedule, ...(file.schedule || {}) },
  };
  // 선택적 환경변수 오버라이드
  if (process.env.AGENT_BUS) c.bus = process.env.AGENT_BUS;
  if (process.env.AGENT_CONTROL_PORT) c.controlPort = Number(process.env.AGENT_CONTROL_PORT);
  if (process.env.AGENT_SCHEDULE_OFF) c.schedule.enabled = false;
  return c;
}
