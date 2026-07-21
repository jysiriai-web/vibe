/* 의견 남기기 — 화면 요소를 집어서 "여기 이런 기능·필터 있으면 좋겠다"를 적어둔다.
 *
 * 왜 이렇게 만들었나:
 *  - 시트를 전혀 안 건드린다. 읽기 전용 캠페인에서도, 클라우드에서도 그대로 된다.
 *  - 저장은 브라우저(localStorage). 서버 저장은 팀 공유가 필요해지면 그때 붙인다
 *    (지금 붙이면 엔드포인트·권한·동시편집이 따라와서 '쉬워야 한다'를 깬다).
 *  - 대신 '전체 복사'로 내보낸다. 붙여넣으면 그대로 작업 지시가 되게 형식을 맞췄다.
 */
(() => {
  const KEY = 'garden.feedback.v1';
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  let items = [];
  let picking = false;

  const load = () => { try { items = JSON.parse(localStorage.getItem(KEY)) || []; } catch { items = []; } };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(items)); } catch {} };

  // 클릭한 요소를 사람이 알아볼 이름으로. 셀렉터가 아니라 '보이는 글자'가 기준 —
  // 나중에 코드가 바뀌어도 의견이 어디를 가리키는지 사람이 읽을 수 있어야 하므로.
  function labelOf(el) {
    const parts = [];
    const tab = $('.tab.active .lb');
    if (tab) parts.push(tab.textContent.trim() + '탭');
    const sub = el.closest('.kpi, thead th, .bar, .qa, .gsec, .subtabs, table, .cards');
    if (sub) {
      if (sub.classList.contains('kpi')) parts.push('카드 「' + (sub.querySelector('.lab')?.textContent.trim() || '') + '」');
      else if (sub.tagName === 'TH') parts.push('열 「' + sub.textContent.replace(/[▲▼▴▾]/g, '').trim() + '」');
      else if (sub.classList.contains('qa')) parts.push('매뉴얼 「' + (sub.querySelector('b')?.textContent.trim() || '') + '」');
      else if (sub.classList.contains('gsec')) parts.push('가이드 「' + (sub.querySelector('h3')?.textContent.trim() || '') + '」');
      else if (sub.classList.contains('bar')) parts.push('버튼줄');
      else if (sub.classList.contains('subtabs')) parts.push('하위탭');
      else if (sub.tagName === 'TABLE') parts.push('표');
    }
    // 클릭한 글자 자체 — 단, 위에서 이미 그 이름을 썼으면(카드/열 제목을 그대로 누른 경우) 중복이라 뺀다.
    const own = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24);
    if (own && own.length > 1 && !parts.some((p) => p.includes(own))) parts.push('“' + own + '”');
    return parts.join(' · ') || '화면';
  }

  function render() {
    const n = items.length;
    const cnt = $('#fbCnt'); if (cnt) cnt.textContent = n ? String(n) : '';
    const list = $('#fbList'); if (!list) return;
    list.innerHTML = n
      ? items.map((it, i) => `<div class="fb-item">
          <div class="fb-where">${esc(it.where)}</div>
          <textarea class="fb-text" data-i="${i}" rows="2" placeholder="어떻게 됐으면 좋겠나요?">${esc(it.text)}</textarea>
          <button class="fb-del" data-del="${i}" title="삭제">✕</button>
        </div>`).join('')
      : `<div class="fb-empty">아직 없어요.<br><b>화면에서 고치고 싶은 곳을 클릭</b>하면 여기에 줄이 생깁니다.</div>`;
  }

  function open() { $('#fbPanel').hidden = false; setPicking(true); render(); }
  function close() { $('#fbPanel').hidden = true; setPicking(false); }

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
    items.unshift({ where: labelOf(e.target), text: '', at: new Date().toISOString().slice(0, 16).replace('T', ' ') });
    save(); render();
    const ta = $('#fbList .fb-text'); if (ta) ta.focus();
  }, true);

  document.addEventListener('input', (e) => {
    const ta = e.target.closest('.fb-text'); if (!ta) return;
    items[+ta.dataset.i].text = ta.value; save();
    const cnt = $('#fbCnt'); if (cnt) cnt.textContent = String(items.length);
  });

  document.addEventListener('click', (e) => {
    if (e.target.closest('#fbBtn')) { $('#fbPanel').hidden ? open() : close(); return; }
    if (e.target.closest('#fbClose')) { close(); return; }
    const del = e.target.closest('[data-del]');
    if (del) { items.splice(+del.dataset.del, 1); save(); render(); return; }
    if (e.target.closest('#fbCopy')) {
      if (!items.length) return void window.toast?.('아직 남긴 의견이 없어요.');
      const txt = items.map((it, i) => `${i + 1}. [${it.where}]\n   ${it.text || '(내용 없음)'}`).join('\n');
      navigator.clipboard?.writeText('▶ 대시보드 의견 ' + items.length + '건\n' + txt)
        .then(() => window.toast?.(`의견 ${items.length}건 복사됨 — 붙여넣어 공유하세요`));
      return;
    }
    if (e.target.closest('#fbClear')) {
      if (!items.length || !confirm(`남긴 의견 ${items.length}건을 모두 지울까요? 되돌릴 수 없어요.`)) return;
      items = []; save(); render(); return;
    }
  });

  load(); render();
})();
