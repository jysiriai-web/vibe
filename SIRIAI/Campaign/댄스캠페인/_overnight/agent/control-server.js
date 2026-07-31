// 127.0.0.1 전용 상태·온디맨드 서버 — bat/터미널 없이 '보기'와 '스캔 요청'을 하는 창.
// 이 프로토타입에서 온디맨드 진입점(브라우저 북마크 http://127.0.0.1:3939)이자, 하트비트/진행/보류 표시(배지)다.
// ⚠️ 127.0.0.1 에만 바인딩(외부 노출 X). 돈 라우트 없음(스캔 전용).
import { createServer } from 'node:http';

function readBody(req) {
  return new Promise((resolve) => {
    let d = '';
    req.on('data', (c) => (d += c));
    req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch { resolve({}); } });
  });
}

// control = { status(), recent(), enqueue(job), go(), resume(), stop() } — worker.js 가 주입.
export function startControlServer(port, control) {
  const server = createServer(async (req, res) => {
    const u = new URL(req.url, 'http://127.0.0.1');
    const send = (code, body, type = 'application/json') => {
      res.writeHead(code, { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
    };
    try {
      if (req.method === 'GET' && u.pathname === '/') return send(200, PAGE, 'text/html');
      if (req.method === 'GET' && u.pathname === '/status') {
        return send(200, { ...(await control.status()), recent: await control.recent() });
      }
      if (req.method === 'POST' && u.pathname === '/enqueue') {
        const b = await readBody(req);
        const job = await control.enqueue({
          type: b.type || 'content-scan', mode: b.mode || 'upload', campaign: b.campaign,
          attended: b.attended !== false, row: b.row, handle: b.handle, link: b.link, source: 'on-demand',
        });
        return send(200, { ok: true, job });
      }
      if (req.method === 'POST' && u.pathname === '/go') return send(200, { ok: control.go() });
      if (req.method === 'POST' && u.pathname === '/resume') return send(200, { ok: control.resume() });
      if (req.method === 'POST' && u.pathname === '/stop') return send(200, { ok: control.stop() });
      send(404, { error: 'not found' });
    } catch (e) { send(500, { error: String((e && e.message) || e) }); }
  });
  server.on('error', (e) => console.error('[control] 서버 오류:', e.message));
  server.listen(port, '127.0.0.1');
  return server;
}

// 단일 파일 상태 페이지 — /status 를 2초마다 폴링. 온디맨드 버튼 + 감독 게이트(스캔 시작/재개/중지).
const PAGE = `<!doctype html><meta charset="utf-8"><title>스캔 에이전트</title>
<style>
 body{font:14px/1.5 system-ui,'Malgun Gothic',sans-serif;max-width:720px;margin:24px auto;padding:0 16px;color:#211a33}
 h1{font-size:18px} .badge{display:inline-block;padding:2px 10px;border-radius:99px;font-weight:600}
 .on{background:#e5f5e0;color:#227a34} .off{background:#fde2e1;color:#a3271f} .warn{background:#fff3cd;color:#8a6d00}
 button{font:inherit;padding:6px 12px;margin:3px 4px 3px 0;border:1px solid #cbd0d8;border-radius:8px;background:#fff;cursor:pointer}
 button.p{background:#211a33;color:#fff;border-color:#211a33}
 .card{border:1px solid #e6e2d6;border-radius:12px;padding:14px 16px;margin:12px 0}
 pre{background:#f6f4ec;padding:10px;border-radius:8px;overflow:auto;font-size:12px}
 .muted{color:#7a7488} table{border-collapse:collapse;width:100%;font-size:12px} td{border-bottom:1px solid #eee;padding:4px 6px}
</style>
<h1>🌱 스캔 에이전트 <span id="hb" class="badge off">…</span></h1>
<div class="card">
  <div id="now" class="muted">상태 불러오는 중…</div>
  <div id="gate" style="margin-top:8px"></div>
</div>
<div class="card">
  <b>온디맨드 스캔</b>
  <div class="muted" style="margin:4px 0 8px">감독 모드: 크롬 창이 뜨면 로봇 인증을 통과한 뒤 [스캔 시작]을 누르세요.</div>
  <button class="p" onclick="enq('upload')">업로드 스캔</button>
  <button onclick="enq('perf')">조회수 스캔</button>
  <button onclick="enq('full')">전체 재스캔</button>
</div>
<div class="card"><b>최근 작업</b><table id="recent"></table></div>
<script>
 const $=s=>document.querySelector(s);
 async function post(p,b){await fetch(p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b||{})});tick();}
 function enq(mode){post('/enqueue',{mode,attended:true});}
 const K={idle:'유휴',starting:'준비',
  'awaiting-human':'로봇 인증 대기(크롬 창 확인)',scanning:'스캔 중',blocked:'막힘 — 재개/중지 필요',done:'완료',error:'오류'};
 async function tick(){
  let s; try{s=await (await fetch('/status')).json();}catch(e){$('#hb').className='badge off';$('#hb').textContent='PC 오프라인';return;}
  const age=s.at?Math.round((Date.now()-new Date(s.at).getTime())/1000):null;
  $('#hb').className='badge '+(s.state&&s.state.authNeeded?'warn':'on');
  $('#hb').textContent=(s.state&&s.state.authNeeded)?'세션 데우기 필요':('온라인'+(age!=null?' · '+age+'초 전':''));
  const st=s.state||{};
  $('#now').innerHTML='버스: <b>'+s.bus+'</b> · 상태: <b>'+(K[st.phase]||st.phase||'-')+'</b>'+
    (st.total?(' · '+st.done+'/'+st.total):'')+(st.type?(' · '+st.type+(st.mode?('/'+st.mode):'')):'')+
    (st.error?(' · <span style="color:#a3271f">'+st.error+'</span>'):'');
  let g='';
  if(st.phase==='awaiting-human')g='<button class="p" onclick="post(\\'/go\\')">스캔 시작</button>';
  if(st.phase==='blocked')g='<button class="p" onclick="post(\\'/resume\\')">재개</button><button onclick="post(\\'/stop\\')">중지</button>';
  if(st.phase==='scanning')g='<button onclick="post(\\'/stop\\')">중지</button>';
  $('#gate').innerHTML=g;
  $('#recent').innerHTML=(s.recent||[]).map(r=>'<tr><td>'+(r.finishedAt||'').slice(5,16).replace('T',' ')+'</td><td>'+(r.type||'')+(r.mode?('/'+r.mode):'')+'</td><td>'+(r.status||'')+'</td><td class="muted">'+(r.result?('up '+(r.result.up??'-')+' / '+(r.result.total??'-')+(r.result.failed?(' · 실패 '+r.result.failed):'')):(r.error||''))+'</td></tr>').join('');
 }
 tick();setInterval(tick,2000);
</script>`;
