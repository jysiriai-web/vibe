// 캠페인 레지스트리 + 환율/설정 — campaigns.json 기반.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const FILE = join(root, 'campaigns.json');

// 클라우드(Vercel)에는 campaigns.json 이 없다(gitignore·비밀) → 환경변수 CAMPAIGNS_JSON 으로 넘긴다.
function readCfg() {
  const env = process.env.CAMPAIGNS_JSON;
  if (env) { try { return JSON.parse(env); } catch { /* 파싱 실패 시 아래 파일 폴백 */ } }
  if (!existsSync(FILE)) return { fx: { calibration: 1, fallbackRate: 1500 }, staleDays: 2, campaigns: [] };
  return JSON.parse(readFileSync(FILE, 'utf8'));
}
// 클라우드는 파일시스템이 읽기전용 → 설정 변경은 대표님 PC에서만.
function writeCfg(cfg) {
  if (process.env.CAMPAIGNS_JSON) throw new Error('클라우드에서는 설정을 바꿀 수 없어요. 대표님 PC 대시보드에서 바꿔주세요.');
  writeFileSync(FILE, JSON.stringify(cfg, null, 2));
}

function decorate(c) {
  const dataDir = join(root, 'data', 'c', c.id);
  try { mkdirSync(dataDir, { recursive: true }); } catch { /* 클라우드는 읽기전용 — 상태는 시트에 있으니 무해 */ }
  return { ...c, dataDir };
}

export function listCampaigns() {
  return readCfg().campaigns.map(decorate);
}
export function getCampaign(id) {
  const c = readCfg().campaigns.find((x) => x.id === id);
  return c ? decorate(c) : null;
}
export function defaultCampaign() {
  return listCampaigns()[0] || null;
}

// ── 환율 ──
export function getFx() {
  const fx = readCfg().fx || {};
  return { calibration: Number(fx.calibration) || 1, fallbackRate: Number(fx.fallbackRate) || 1500 };
}
export function setCalibration(cal) {
  const cfg = readCfg();
  cfg.fx = cfg.fx || {};
  cfg.fx.calibration = Number(cal);
  writeCfg(cfg);
}
export function setFallbackRate(r) {
  const cfg = readCfg();
  cfg.fx = cfg.fx || {};
  cfg.fx.fallbackRate = Number(r);
  writeCfg(cfg);
}

export function getStaleDays() {
  return Number(readCfg().staleDays) || 2;
}

// ── 캠페인 서비스 변경 ──
export function setService(campaignId, serviceId) {
  const cfg = readCfg();
  const c = cfg.campaigns.find((x) => x.id === campaignId);
  if (!c) return false;
  c.serviceId = Number(serviceId);
  writeCfg(cfg);
  return true;
}
