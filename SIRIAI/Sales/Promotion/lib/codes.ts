import { COMPANIES, type Company } from "./companies";

export type { Company };

/* 코드 → 회사 레지스트리. 실데이터는 마스터시트에서 생성된 companies.ts,
   여기에 시연·QA용 테스트 코드를 더한다. 대소문자 구분 없이 매칭. */

/**
 * 테스트 코드 — 3가지 노출 상태를 모두 확인할 수 있게 구성.
 *
 * 시트에 없는 코드라 **열람 횟수(O열)를 건드리지 않고**, 진입 기록도 시트로
 * 보내지 않는다(lib/access-log.ts 의 test 플래그). 즉 아무리 눌러봐도
 * 마스터시트가 더러워지지 않는다. 게이트 UI에는 노출되지 않으니 직접 입력해서 사용.
 */
const TEST_COMPANIES: Company[] = [
  { code: "TEST-COLOR", brand: "샘플 브랜드 (색조)", segment: "beauty", gubun: "색조" },
  { code: "TEST-SKIN", brand: "샘플 브랜드 (스킨케어)", segment: "skincare", gubun: "스킨케어" },
  // 전용 세그먼트가 없는 구분 — 8월 실데이터 270건 중 68건(헤어바디·향수·이너뷰티).
  // 데이터는 스킨케어 것을 쓰되 문구만 중립으로 나오는지 확인용.
  { code: "TEST-NEUTRAL", brand: "샘플 브랜드", segment: "skincare", gubun: "향수" },
];

const BY_CODE: Map<string, Company> = new Map(
  [...COMPANIES, ...TEST_COMPANIES].map((c) => [c.code.toUpperCase(), c]),
);

export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

/** 테스트 코드 여부 — 시트 기록을 건너뛸지 판단하는 데 쓴다. */
export function isTestCode(raw: string): boolean {
  return normalizeCode(raw).startsWith("TEST-");
}

export function lookupCompany(raw: string): Company | null {
  return BY_CODE.get(normalizeCode(raw)) ?? null;
}
