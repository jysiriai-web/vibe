/**
 * 코드 입력 → 페이지 진입 기록.
 *
 * (이 모듈은 "use server"인 lib/actions.ts에서만 import된다 → 클라이언트 번들에 실리지 않는다.)
 *
 * 서버리스 파일시스템은 휘발성이라 파일에 못 쌓는다. 그래서 2단계로 남긴다:
 *   1) 항상 구조화 로그 → Vercel Functions 로그 (설정 0, 항상 동작)
 *   2) ACCESS_LOG_WEBHOOK 환경변수가 있으면 그 URL로 POST
 *      → Google Apps Script 웹앱을 붙이면 마스터시트에 행으로 바로 쌓인다.
 *
 * 로깅 실패가 부스 현장의 코드 입력을 절대 막지 않도록, 타임아웃 + try/catch로 감싼다.
 */

export interface AccessRecord {
  /** ISO timestamp (UTC) */
  ts: string;
  /** 입력된 코드 (정규화 후) */
  code: string;
  /** 매칭된 브랜드명 — 코드가 틀리면 "" */
  brand: string;
  /** beauty | skincare — 코드가 틀리면 "" */
  segment: string;
  /** 시트 D열 구분 */
  gubun: string;
  /** 코드 매칭 성공 여부 (오타 추적용) */
  ok: boolean;
  /** 테스트 코드 진입 — 콘솔 로그에만 남기고 시트로는 보내지 않는다 */
  test?: boolean;
}

const TIMEOUT_MS = 2500;

export async function recordEntry(rec: AccessRecord): Promise<void> {
  // 1) 항상 남는 기록 — Vercel 함수 로그에서 "[entry]"로 검색 가능
  console.log("[entry]", JSON.stringify(rec));

  // 테스트 코드는 여기까지 — 마스터시트를 더럽히지 않는다
  if (rec.test) return;

  // 2) 웹훅이 설정돼 있으면 시트로 전송
  const url = process.env.ACCESS_LOG_WEBHOOK;
  if (!url) return;

  // Apps Script 웹앱은 "모든 사용자" 공개라야 서버가 호출할 수 있다.
  // URL이 새어도 카운트를 조작하지 못하도록 공유 토큰을 같이 보낸다(선택).
  const token = process.env.ACCESS_LOG_TOKEN;
  const payload = token ? { ...rec, token } : rec;

  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    // 기록 실패는 조용히 넘어간다 — 진입을 막지 않는 것이 우선
  }
}
