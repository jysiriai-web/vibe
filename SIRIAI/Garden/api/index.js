// Vercel 서버리스 진입점 — 로컬 서버(src/server.js)와 똑같은 요청 핸들러를 그대로 쓴다.
// 스캔·집행 등 로컬 전용 라우트는 handler 안에서 501 로 막힌다(src/cloud.js LOCAL_ONLY).
import { handler } from '../src/server.js';

export default handler;
