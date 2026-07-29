// 클라우드(Vercel) 모드.
// 팀 URL 은 비번 없이 그냥 열린다 (대표님 지시 — 누가 봐도 상관없는 자료).
// 대신 돈·스캔은 클라우드에서 아예 실행 불가다: 아래 LOCAL_ONLY 로 막고,
// smmkings API 키는 Vercel 에 넣지 않는다. 그래서 URL 을 아는 사람도 지출을 일으킬 수 없다.

export const CLOUD = !!(process.env.GARDEN_CLOUD || process.env.VERCEL);

// 클라우드 설정 안전장치 — 이게 없으면 화면이 텅 비거나 잘못된 데이터를 보여준다.
export function cloudConfigError() {
  if (!CLOUD) return null;
  const missing = [];
  if (!process.env.CAMPAIGNS_JSON) missing.push('CAMPAIGNS_JSON');
  if ((process.env.GARDEN_STATE || '').toLowerCase() !== 'sheet') missing.push('GARDEN_STATE=sheet');
  if (!missing.length) return null;
  return `Vercel 환경변수가 빠졌어요: ${missing.join(', ')}\nSettings → Environments → Production 에서 넣고, Deployments 에서 Redeploy 하세요.`;
}

// 클라우드에서 실행 불가한 것들 — 대표님 PC 대시보드 전용.
// (틱톡 스캔은 집 IP+실제 크롬 필요, 집행/종료/포기는 돈, 환율·서비스는 설정 파일 쓰기)
export const LOCAL_ONLY = new Set([
  '/api/scan',
  '/api/content-scan',
  '/api/content-scan/status',
  '/api/content-scan/confirm',
  '/api/content-scan/pause',
  '/api/content-scan/resume',
  '/api/content-scan/stop',
  '/api/judge-link',
  '/api/scan-one',
  /* '/api/deliver' 는 여기 없다 — 팀원도 납품시트에 기입할 수 있어야 한다.
     돈도 브라우저도 안 쓰고 시트만 만지며, 같은 성격의 셀 편집(/api/cell)은 이미 열려 있다.
     예전엔 막혀 있었는데 버튼은 팀원 화면에도 그려져서, 누르면 501 만 났다. */
  '/api/exit-ip',
  '/api/plan',
  '/api/execute',
  '/api/order/close',
  '/api/order/abandon',
  '/api/order/done',      // 새로 만든 것 — 여기 안 넣으면 배포본 공개 URL 에서 장부를 고칠 수 있다

  '/api/order/refill',
  '/api/rate',
  '/api/service',
  // 서비스 선택·카탈로그 갱신 — 돈이 직접 나가진 않지만 '다음에 무엇을 살지' 를 정한다.
  // 브릿지 인증은 토큰 하나뿐이라, 여기 안 적으면 공개 URL 을 아는 누구나 바꿀 수 있다.
  '/api/services/refresh',
]);
export const isLocalOnly = (path) => CLOUD && LOCAL_ONLY.has(path);
