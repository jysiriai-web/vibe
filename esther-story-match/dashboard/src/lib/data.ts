import fs from 'fs';
import path from 'path';

export type PersonType = '인플루언서' | '동행자';

export interface MasterPerson {
  id: string;
  name: string;
  handle: string | null;
  type: PersonType;
  visit_date: string | null;
  linked_influencer?: string;
  matchable: boolean;
}

export interface ConfirmedMatch {
  person_id: string;
  name: string;
  handle: string;
  type: PersonType;
  visit_date: string | null;
  linked_influencer: string | null;
  capture_file: string;
  extracted_handle: string;
  confidence: number;
  matched_at: string;
  review?: boolean;
}

export interface NoMatchItem {
  capture_file: string;
  extracted_handle: string | null;
  error?: string;
  review?: boolean;
}

export interface MatchState {
  confirmed: ConfirmedMatch[];
  review_queue: unknown[];
  no_match: NoMatchItem[];
  processed_files: string[];
}

export interface DayData {
  date: string;          // '2026-05-01'
  label: string;         // '5/1'
  confirmed: (MasterPerson & { capture_file: string; confidence: number })[];
  unuploaded: MasterPerson[];
}

export interface DashboardData {
  days: DayData[];
  noMatch: NoMatchItem[];
  stats: {
    total: number;
    uploaded: number;
    unuploaded: number;
    noMatch: number;
    uploadRate: number;
  };
}

const ROOT = path.resolve(process.cwd(), '..');

function readJson<T>(filename: string, fallback: T): T {
  const p = path.join(ROOT, 'data', filename);
  if (!fs.existsSync(p)) return fallback;
  return JSON.parse(fs.readFileSync(p, 'utf-8')) as T;
}

export function loadDashboardData(): DashboardData {
  const master = readJson<MasterPerson[]>('parsed-master.json', []);
  const state  = readJson<MatchState>('matches.json', { confirmed: [], review_queue: [], no_match: [], processed_files: [] });

  const confirmedMap = new Map<string, ConfirmedMatch>();
  (state.confirmed ?? []).forEach(c => confirmedMap.set(c.person_id, c));

  const DAYS = [
    { date: '2026-05-01', label: '5/1' },
    { date: '2026-05-02', label: '5/2' },
    { date: '2026-05-03', label: '5/3' },
  ];
  const dayDateSet = new Set(DAYS.map(d => d.date));

  // 캡처 파일명에서 날짜 추출 (예: "스크린샷 2026-05-01 172439.png" → "2026-05-01")
  function captureDateKey(match: ConfirmedMatch): string {
    const m = match.capture_file.match(/(\d{4}-\d{2}-\d{2})/);
    const capDate = m?.[1];
    // 캡처 날짜가 팝업 기간 내에 있으면 그 날짜로, 아니면 마스터 방문일로 fallback
    return (capDate && dayDateSet.has(capDate)) ? capDate : (match.visit_date ?? '');
  }

  // confirmed를 캡처 날짜 기준으로 그룹핑
  const confirmedByCapDate = new Map<string, ConfirmedMatch[]>();
  for (const match of state.confirmed ?? []) {
    const key = captureDateKey(match);
    if (!confirmedByCapDate.has(key)) confirmedByCapDate.set(key, []);
    confirmedByCapDate.get(key)!.push(match);
  }

  const confirmedPersonIds = new Set((state.confirmed ?? []).map(c => c.person_id));

  const days: DayData[] = DAYS.map(({ date, label }) => {
    const confirmed: DayData['confirmed'] = (confirmedByCapDate.get(date) ?? [])
      .map(m => {
        const person = master.find(p => p.id === m.person_id);
        return person ? { ...person, capture_file: m.capture_file, confidence: m.confidence } : null;
      })
      .filter(Boolean) as DayData['confirmed'];

    // 미업로드: 해당 날짜 방문 예정이지만 아직 캡처 안 된 사람
    const unuploaded = master.filter(p => p.visit_date === date && p.matchable && !confirmedPersonIds.has(p.id));

    return { date, label, confirmed, unuploaded };
  });

  const totalMatchable = master.filter(p => p.matchable).length;
  const uploaded = (state.confirmed ?? []).length;

  return {
    days,
    noMatch: state.no_match ?? [],
    stats: {
      total: totalMatchable,
      uploaded,
      unuploaded: totalMatchable - uploaded,
      noMatch: (state.no_match ?? []).length,
      uploadRate: totalMatchable > 0 ? Math.round((uploaded / totalMatchable) * 100) : 0,
    },
  };
}
