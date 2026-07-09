// 캠페인 레지스트리 + 환율/설정 — campaigns.json 기반.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const FILE = join(root, 'campaigns.json');

function readCfg() {
  if (!existsSync(FILE)) return { fx: { calibration: 1, fallbackRate: 1500 }, staleDays: 2, campaigns: [] };
  return JSON.parse(readFileSync(FILE, 'utf8'));
}
function writeCfg(cfg) {
  writeFileSync(FILE, JSON.stringify(cfg, null, 2));
}

function decorate(c) {
  const dataDir = join(root, 'data', 'c', c.id);
  mkdirSync(dataDir, { recursive: true });
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
