/* 의견 남기기 — 화면 요소를 집어서 "여기 이런 기능·필터 있으면 좋겠다"를 적어둔다.
 *
 * 저장은 **마스터시트 '의견' 탭**이다(브라우저가 아니라). 팀 4명이 각자 PC에서 남겨도
 * 같은 목록을 본다 — localStorage 로 두면 각자 화면에만 남아 서로 안 보이고, 브라우저를
 * 정리하면 사라진다. 마스터 데이터와 완전히 분리된 탭이라 읽기전용 캠페인에서도 열려 있다.
 *
 * 이름은 이 브라우저에만 저장한다(누가 썼는지 표시용). 서버에 계정 개념이 없으므로.
 */
(() => {
  const NAME_KEY = 'garden.feedback.name';
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const camp = () => new URLSearchParams(location.search).get('campaign') || (location.pathname.includes('lun8') ? 'lun8' : '');
  const api = (q = '') => '/api/feedback' + (camp() ? `?campaign=${encodeURIComponent(camp())}${q}` : q.replace('&', '?'));

  let items = [];
  let picking = false;
  let pending = null;   // 방금 집은 위치 — 아직 저장 전
  let who = localStorage.getItem(NAME_KEY) || '';

  // 클릭한 요소를 사람이 알아볼 이름으로. 셀렉터가 아니라 '보이는 글자'가 기준 —
  // 나중에 코드가 바뀌어도 의견이 어디를 가리키는지 사람이 읽을 수 있어야 하므로.
  function labelOf(el) {
    const parts = [];
    const tab = $('.tab.active .lb');
    if (tab) parts.push(tab.textContent.trim() + '탭');
    const sub = el.closest('.kpi, thead th, .bar, .qa, .gsec, .subtabs, table, .cards, .wchip');
    if (sub) {
      if (sub.classList.contains('kpi')) parts.push('카드 「' + (sub.querySelector('.lab')?.textContent.trim() || '') + '」');
      else if (sub.classList.contains('wchip')) parts.push('주차칩 「' + (sub.querySelector('.wl')?.textContent.trim() || '') + '」');
      else if (sub.tagName === 'TH') parts.push('열 「' + sub.textContent.replace(/[▲▼▴▾]/g, '').trim() + '」');
      else if (sub.classList.contains('qa')) parts.push('매뉴얼 「' + (sub.querySelector('b')?.textContent.trim() || '') + '」');
      else if (sub.classList.contains('gsec')) parts.push('가이드 「' + (sub.querySelector('h3')?.textContent.trim() || '') + '」');
      else if (sub.classList.contains('bar')) parts.push('버튼줄');
      else if (sub.classList.contains('subtabs')) parts.push('하위탭');
      else if (sub.tagName === 'TABLE') parts.push('표');
    }
    const own = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24);
    if (own && own.length > 1 && !parts.some((p) => p.includes(own))) parts.push('“' + own + '”');
    return parts.join(' · ') || '화면';
  }

  const say = (m) => (window.toast ? window.toast(m) : console.log(m));

  // 시트가 'MM/dd HH:mm' 을 날짜로 자동 파싱해 되돌려주면 장문의 Date 문자열이 온다.
  // 시트 서식을 텍스트로 바꾸려면 재배포가 필요해서, 읽는 쪽에서 짧게 정리한다.
  const when = (v) => {
    const s = String(v ?? '').trim();
    if (!s) return '';
    const d = new Date(s);
    if (isNaN(d.getTime())) return s.slice(0, 16);
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  // 시트 왕복이 1~3초라 열자마자 빈 창이 떴다. 지난번 목록을 브라우저에 넣어 두고
  // 여는 즉시 그린 뒤, 새 목록이 오면 조용히 갈아끼운다.
  const CK = 'lun8.fb.cache';
  function loadCache() {
    try { const v = JSON.parse(localStorage.getItem(CK) || 'null'); if (Array.isArray(v)) items = v; } catch {}
  }
  let loading = false;
  async function load(quiet) {
    if (loading) return; loading = true;
    try {
      const r = await fetch(api(), { cache: 'no-store' });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      items = j.feedback || [];
      try { localStorage.setItem(CK, JSON.stringify(items)); } catch {}
      render();
    } catch (e) {
      // 캐시로 이미 뭔가 보여주고 있으면 조용히 넘어간다 — 있는 목록을 오류로 덮지 않는다.
      if (quiet && items.length) return;
      const l = $('#fbList');
      if (l) l.innerHTML = `<div class="fb-empty">의견을 못 불러왔어요.<br><span style="font-size:11.5px">${esc(e.message)}</span></div>`;
    } finally { loading = false; }
  }

  function render() {
    const open = items.filter((i) => !i.done);
    const cnt = $('#fbCnt'); if (cnt) cnt.textContent = open.length ? String(open.length) : '';
    const list = $('#fbList'); if (!list) return;
    const form = pending ? `<div class="fb-item fb-new">
        <div class="fb-where">${esc(pending)}</div>
        <textarea class="fb-text" id="fbInput" rows="3" placeholder="어떻게 됐으면 좋겠나요?"></textarea>
        <div class="fb-row"><input class="fb-name" id="fbWho" placeholder="이름(선택)" value="${esc(who)}">
          <button class="btn small primary" id="fbSave">남기기</button>
          <button class="btn small ghost" id="fbCancel">취소</button></div>
      </div>` : '';
    // 완료한 건 안 보여준다 — 남은 일만 있어야 목록이 '할 일'로 읽힌다.
    // (시트 「의견」 탭에는 그대로 남아 있어서 기록이 사라지는 건 아니다)
    const rows = open.length
      ? open.map((it) => `<div class="fb-item">
          <div class="fb-where">${esc(it.where)}</div>
          <div class="fb-body">${esc(it.text)}</div>
          <div class="fb-meta">${esc(it.who || '팀원')} · ${esc(when(it.at))}
            <button class="fb-ok" data-done="${it.row}">완료 표시</button></div>
        </div>`).join('')
      : (pending ? '' : `<div class="fb-empty">${items.length ? '남은 의견이 없어요. <br><span style="font-size:11.5px">완료한 건 시트 「의견」 탭에 남아 있어요.</span>' : '아직 없어요.<br><b>화면에서 고치고 싶은 곳을 클릭</b>하면 여기에 줄이 생깁니다.'}</div>`);
    list.innerHTML = form + rows;
    if (pending) $('#fbInput')?.focus();
  }

  function open() { $('#fbPanel').hidden = false; setPicking(true); render(); load(true); }
  function close() { $('#fbPanel').hidden = true; setPicking(false); pending = null; }

  function setPicking(on) {
    picking = on;
    document.body.classList.toggle('fb-picking', on);
    const h = $('#fbHint');
    if (h) h.innerHTML = on ? '화면에서 <b>고칠 곳을 클릭</b>하세요' : '집기 꺼짐 — 💬 를 다시 누르면 켜져요';
  }

  // 집기 모드에서의 클릭: 원래 동작을 막고 의견 줄만 만든다.
  document.addEventListener('click', (e) => {
    if (!picking) return;
    if (e.target.closest('#fbPanel') || e.target.closest('#fbBtn')) return;
    e.preventDefault(); e.stopPropagation();
    pending = labelOf(e.target);
    render();
  }, true);

  async function save() {
    const text = $('#fbInput')?.value.trim();
    if (!text) return say('내용을 적어주세요.');
    who = $('#fbWho')?.value.trim() || '';
    if (who) localStorage.setItem(NAME_KEY, who);
    const btn = $('#fbSave'); if (btn) { btn.disabled = true; btn.textContent = '저장 중…'; }
    try {
      const r = await fetch(api(), { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ where: pending, text, who }) });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      pending = null;
      say('의견이 마스터시트 「의견」 탭에 저장됐어요 — 팀 전체가 봅니다');
      await load();
    } catch (e) {
      say('저장 실패: ' + e.message);
      if (btn) { btn.disabled = false; btn.textContent = '남기기'; }
    }
  }

  document.addEventListener('click', async (e) => {
    if (e.target.closest('#fbBtn')) { $('#fbPanel').hidden ? open() : close(); return; }
    if (e.target.closest('#fbClose')) { close(); return; }
    if (e.target.closest('#fbSave')) { save(); return; }
    if (e.target.closest('#fbCancel')) { pending = null; render(); return; }
    const ok = e.target.closest('[data-done]');
    if (ok) {
      try {
        // 먼저 화면에서 치우고 시트는 뒤에서 — 누른 뒤 1~3초 멈춰 있으면 두 번 누르게 된다.
        const row = String(ok.dataset.done);
        const hit = items.find((i) => String(i.row) === row);
        if (hit) { hit.done = true; render(); try { localStorage.setItem(CK, JSON.stringify(items)); } catch {} }
        await fetch(api(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ done: row }) });
        await load(true);
      } catch (er) { say('완료 표시 실패: ' + er.message); }
      return;
    }
    if (e.target.closest('#fbCopy')) {
      const open2 = items.filter((i) => !i.done);
      if (!open2.length) return say('남은 의견이 없어요.');
      const txt = open2.map((it, i) => `${i + 1}. [${it.where}] (${it.who || '팀원'})\n   ${it.text}`).join('\n');
      navigator.clipboard?.writeText('▶ 대시보드 의견 ' + open2.length + '건\n' + txt)
        .then(() => say(`의견 ${open2.length}건 복사됨`));
      return;
    }
    if (e.target.closest('#fbClear')) { say('시트 「의견」 탭에서 직접 지워주세요 — 여기선 완료 표시만 합니다.'); return; }
  });

  // 캐시를 먼저 깔고 그린다(뱃지 숫자가 새로고침 직후에도 바로 보이게).
  loadCache();
  render();
  // 화면 로딩이 끝난 뒤 조용히 최신으로 — 팝업을 열 때는 이미 받아둔 상태가 된다.
  setTimeout(function () { load(true); }, 1200);
})();
