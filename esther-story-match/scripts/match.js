require('dotenv').config({ path: require('path').resolve(__dirname, '../.env'), quiet: true });
const Anthropic = require('@anthropic-ai/sdk');
const fs   = require('fs');
const path = require('path');

const MASTER_PATH  = path.resolve(__dirname, '../data/parsed-master.json');
const MATCHES_PATH = path.resolve(__dirname, '../data/matches.json');
const CAPTURES_DIR = path.resolve(__dirname, '../captures');

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

// Claude Vision에 보낼 프롬프트
const VISION_PROMPT = `이 이미지는 인스타그램 스토리 캡쳐 화면입니다.
좌상단에 표시된 계정 아이디(핸들)만 추출해주세요.
규칙:
- @ 기호 제거
- 공백 없이 아이디 문자열만 반환
- 찾을 수 없으면 UNKNOWN 반환
예시 출력: bree_zgu_`;

// ─── 유사도: 편집거리 기반 (0~1) ─────────────────────────────────────
function similarity(a, b) {
  a = a.toLowerCase().replace(/\s/g, '');
  b = b.toLowerCase().replace(/\s/g, '');
  if (a === b) return 1;
  const m = a.length, n = b.length;
  // 길이 차이가 너무 크면 빠르게 탈락
  if (Math.abs(m - n) > Math.max(m, n) * 0.5) return 0;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return 1 - dp[m][n] / Math.max(m, n);
}

// 점·언더스코어 제거한 정규화 핸들
function normalize(h) {
  return h.toLowerCase().replace(/[._]/g, '');
}

// ─── 마스터 리스트에서 후보 추출 ─────────────────────────────────────
function findCandidates(extracted, master, topN = 5) {
  const normExtracted = normalize(extracted);
  return master
    .filter(p => p.matchable && p.handle)
    .map(p => {
      const normHandle = normalize(p.handle);
      // 정규화 일치 시 완전 점수 부여 (점·언더스코어 차이 무시)
      const score = normHandle === normExtracted ? 1.0 : similarity(extracted, p.handle);
      return { ...p, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}

// ─── Claude Vision으로 핸들 추출 ─────────────────────────────────────
async function extractHandle(client, imgPath) {
  const ext = path.extname(imgPath).toLowerCase();
  const mediaType = ext === '.png' ? 'image/png'
    : ext === '.webp' ? 'image/webp'
    : 'image/jpeg';

  const base64 = fs.readFileSync(imgPath).toString('base64');

  const res = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 64,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
        { type: 'text', text: VISION_PROMPT },
      ],
    }],
  });

  const raw = res.content[0]?.text?.trim() ?? 'UNKNOWN';
  // @, 줄바꿈, 공백 제거 후 첫 토큰만 사용
  return raw.replace(/^@/, '').split(/[\s\n]/)[0];
}

// ─── 상태 파일 로드 / 저장 ────────────────────────────────────────────
function loadState() {
  if (fs.existsSync(MATCHES_PATH)) {
    return JSON.parse(fs.readFileSync(MATCHES_PATH, 'utf-8'));
  }
  return { confirmed: [], review_queue: [], no_match: [], processed_files: [] };
}

function saveState(state) {
  fs.writeFileSync(MATCHES_PATH, JSON.stringify(state, null, 2), 'utf-8');
}

// ─── captures/ 하위 이미지 수집 ───────────────────────────────────────
function collectImages(dir) {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...collectImages(full));
    else if (IMAGE_EXTS.has(path.extname(entry.name).toLowerCase())) results.push(full);
  }
  return results;
}

// ─── 메인 ─────────────────────────────────────────────────────────────
async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY 환경변수가 없습니다.');
    console.error('실행 전: set ANTHROPIC_API_KEY=sk-ant-...');
    process.exit(1);
  }

  const client = new Anthropic();
  const master = JSON.parse(fs.readFileSync(MASTER_PATH, 'utf-8'));
  const state  = loadState();
  const processed = new Set(state.processed_files);

  const allImages = collectImages(CAPTURES_DIR);
  const newImages = allImages.filter(f => !processed.has(f));

  if (newImages.length === 0) {
    console.log('처리할 새 이미지 없음. captures/ 폴더를 확인해주세요.');
    printSummary(state);
    return;
  }

  console.log(`새 이미지 ${newImages.length}장 처리 시작\n`);

  const AUTO_THRESHOLD   = 0.85; // 이상이면 자동 확정
  const REVIEW_THRESHOLD = 0.50; // 이상이면 검수 큐

  for (let i = 0; i < newImages.length; i++) {
    const imgPath = newImages[i];
    const rel     = path.relative(path.resolve(__dirname, '..'), imgPath);
    const prefix  = `[${i + 1}/${newImages.length}] ${path.basename(imgPath)}`;

    process.stdout.write(`${prefix} → Vision API 호출 중... `);

    let extracted;
    try {
      extracted = await extractHandle(client, imgPath);
    } catch (err) {
      console.log(`오류: ${err.message}`);
      state.no_match.push({ capture_file: rel, extracted_handle: null, error: err.message });
      state.processed_files.push(imgPath);
      saveState(state);
      continue;
    }

    if (!extracted || extracted === 'UNKNOWN') {
      console.log('핸들 식별 실패');
      state.no_match.push({ capture_file: rel, extracted_handle: null });
      state.processed_files.push(imgPath);
      saveState(state);
      continue;
    }

    const candidates = findCandidates(extracted, master);
    const top        = candidates[0];

    if (top && top.score >= AUTO_THRESHOLD) {
      // 자동 확정
      console.log(`자동 매칭: "${extracted}" → @${top.handle} (${top.name}) ${pct(top.score)}`);
      state.confirmed.push({
        person_id:         top.id,
        name:              top.name,
        handle:            top.handle,
        type:              top.type,
        visit_date:        top.visit_date,
        linked_influencer: top.linked_influencer ?? null,
        capture_file:      rel,
        extracted_handle:  extracted,
        confidence:        top.score,
        matched_at:        new Date().toISOString(),
      });

    } else if (top && top.score >= REVIEW_THRESHOLD) {
      // 검수 큐
      console.log(`검수 필요: "${extracted}" (최고 후보: @${top.handle} ${pct(top.score)})`);
      state.review_queue.push({
        capture_file:     rel,
        extracted_handle: extracted,
        candidates: candidates.slice(0, 3).map(c => ({
          person_id:  c.id,
          name:       c.name,
          handle:     c.handle,
          type:       c.type,
          visit_date: c.visit_date,
          score:      c.score,
        })),
      });

    } else {
      // 매칭 실패
      console.log(`매칭 실패: "${extracted}" (최고 유사도: ${top ? pct(top.score) : '-'})`);
      state.no_match.push({
        capture_file:     rel,
        extracted_handle: extracted,
        top_candidate:    top ? { name: top.name, handle: top.handle, score: top.score } : null,
      });
    }

    state.processed_files.push(imgPath);
    saveState(state);
  }

  console.log('');
  printSummary(state);
}

function pct(score) {
  return `(${(score * 100).toFixed(0)}%)`;
}

function printSummary(state) {
  const total = state.confirmed.length + state.review_queue.length + state.no_match.length;
  console.log('─'.repeat(40));
  console.log(`자동 확정  : ${state.confirmed.length}건`);
  console.log(`검수 필요  : ${state.review_queue.length}건`);
  console.log(`매칭 실패  : ${state.no_match.length}건`);
  console.log(`처리 완료  : ${total}건`);
  if (state.review_queue.length > 0) {
    console.log('\n→ 검수가 필요한 케이스가 있습니다: node scripts/review-server.js');
  }
}

main().catch(err => { console.error(err.message); process.exit(1); });
