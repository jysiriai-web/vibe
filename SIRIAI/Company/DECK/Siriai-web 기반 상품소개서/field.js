/* SIRIAI — Field
   A luminous "signal field": a warm coral→indigo colour wash overlaid with a
   living relief of contour lines (raw signal resolving into structure). A single
   soft light is the only object — bring it near the words and they transmute,
   in place, from English into Korean / Japanese. No lens, no magnify. */
(function () {
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const stage  = document.querySelector('.stage');
  const canvas = document.getElementById('field');
  const ctx    = canvas.getContext('2d');
  const glow   = document.getElementById('glow');
  const root   = document.documentElement;

  /* ---------- grain ---------- */
  (function () {
    const s = 110, cv = document.createElement('canvas'); cv.width = cv.height = s;
    const g = cv.getContext('2d'), im = g.createImageData(s, s);
    for (let i = 0; i < im.data.length; i += 4) {
      const v = Math.random() * 255 | 0;
      im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255;
    }
    g.putImageData(im, 0, 0);
    document.getElementById('grain').style.backgroundImage = `url(${cv.toDataURL()})`;
  })();

  /* ---------- clocks ---------- */
  (function () {
    const map = [['c-seoul', 'Asia/Seoul'], ['c-sf', 'America/Los_Angeles'], ['c-tok', 'Asia/Tokyo']];
    function tick() {
      map.forEach(([id, tz]) => {
        const t = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
        const hh = String(t.getHours()).padStart(2, '0');
        const mm = String(t.getMinutes()).padStart(2, '0');
        const el = document.getElementById(id); if (el) el.textContent = `${hh}:${mm}`;
      });
    }
    tick(); setInterval(tick, 1000 * 20);
  })();

  /* ---------- colour wash (soft blob field) ---------- */
  let W = 0, H = 0, DPR = Math.min(devicePixelRatio || 1, 2);
  const SC = 0.16;
  const buf = document.createElement('canvas');
  const bctx = buf.getContext('2d');

  const BLOBS = [
    { col: '#f0d3bb', rx: .26, ry: .30, r: .55, ph: 0.0, sp: 0.17, amp: .12 }, // peach
    { col: '#ddd0ef', rx: .68, ry: .26, r: .50, ph: 1.7, sp: 0.13, amp: .14 }, // lavender
    { col: '#cedcef', rx: .50, ry: .68, r: .52, ph: 3.1, sp: 0.20, amp: .10 }, // sky
    { col: '#e9dcc6', rx: .82, ry: .74, r: .60, ph: 0.7, sp: 0.11, amp: .16 }, // sand
    { col: '#e0d2ea', rx: .16, ry: .80, r: .48, ph: 4.2, sp: 0.15, amp: .14 }, // lilac
    { col: '#eee7d8', rx: .90, ry: .14, r: .42, ph: 2.4, sp: 0.09, amp: .18 }, // near-cream
    { col: '#f6c9a8', rx: .42, ry: .40, r: .30, ph: 5.0, sp: 0.23, amp: .09 }, // warm ember (the light)
  ];

  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`;
  }

  let tmx = 0.5, tmy = 0.46;
  function drawField(time) {
    const bw = buf.width, bh = buf.height;
    bctx.globalCompositeOperation = 'source-over';
    bctx.fillStyle = '#f3eee2';
    bctx.fillRect(0, 0, bw, bh);
    for (const b of BLOBS) {
      const wob = b.amp;
      const cx = (b.rx + Math.cos(time * b.sp + b.ph) * wob + (tmx - 0.5) * 0.10 * b.r) * bw;
      const cy = (b.ry + Math.sin(time * b.sp * 1.3 + b.ph) * wob + (tmy - 0.5) * 0.10 * b.r) * bh;
      const rad = b.r * Math.min(bw, bh) * 1.15;
      const g = bctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
      g.addColorStop(0, b.col);
      g.addColorStop(1, hexA(b.col, 0));
      bctx.fillStyle = g;
      bctx.beginPath(); bctx.arc(cx, cy, rad, 0, 6.2832); bctx.fill();
    }
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(buf, 0, 0, bw, bh, 0, 0, W, H);
  }

  /* ---------- contour relief (signal → structure) ---------- */
  function drawContours(t) {
    const N = Math.max(22, Math.round(H / 24));
    const cols = 66;
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.lineJoin = 'round';
    for (let i = 0; i < N; i++) {
      const fy = (i + 0.5) / N;
      const baseY = fy * H;
      const edge = Math.sin(Math.PI * fy);          // fade toward top/bottom
      ctx.beginPath();
      let bunch = 0;
      for (let j = 0; j <= cols; j++) {
        const fx = j / cols, x = fx * W;
        let d = 0;
        d += Math.sin(fx * 5.5 + t * 0.22 + i * 0.32) * 16;
        d += Math.sin(fx * 2.2 - t * 0.15 + i * 0.55) * 28;
        d += Math.cos(fx * 3.3 + t * 0.10 + i * 0.18) * 13;
        d += Math.sin(fx * 1.1 + i * 0.92 + t * 0.08) * 18;   // makes neighbours bunch/spread
        // the light lifts the terrain beneath it into a soft peak
        const ddx = x - gx, ddy = baseY - gy;
        const lift = -62 * Math.exp(-(ddx * ddx + ddy * ddy) / (2 * 150 * 150));
        const y = baseY + d + lift;
        bunch += Math.abs(d) * 0.0008;
        if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      // darker where the terrain steepens — reads as a relief ridge on the cream
      const a = (0.05 + Math.min(0.045, bunch * 0.04)) * edge + 0.012;
      ctx.lineWidth = 1.0 + edge * 0.5;
      ctx.strokeStyle = `rgba(86,70,120,${a})`;
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ---------- layout ---------- */
  let inited = false;
  function resize() {
    const w = innerWidth, h = innerHeight;
    if (w === 0 || h === 0) { requestAnimationFrame(resize); setTimeout(resize, 60); return; }
    W = w; H = h;
    canvas.width = W * DPR; canvas.height = H * DPR;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    buf.width = Math.max(2, Math.round(W * SC)); buf.height = Math.max(2, Math.round(H * SC));
    if (!inited) { gx = W * 0.5; gy = H * 0.46; inited = true; }
    paintNow();
  }

  /* ---------- main copy: KO default, auto-cycles KO → EN → JP (low interaction) ---------- */
  const LANGS = [
    { t: '가장 쉬운 AI 리터러시,<br>가장 감각적인 인사이트', ko: true },
    { t: 'The easiest AI literacy,<br>the most intuitive insight' },
    { t: '最も易しいAIリテラシー、<br>最も感覚的なインサイト', jp: true },
  ];
  const lang   = document.getElementById('lang');
  const stmt   = document.querySelector('.stmt');
  const ttext  = document.getElementById('ttext');
  const mark   = document.getElementById('mark');
  let langIdx = 0, switching = false;

  function setLang(idx) {
    if (switching || idx === langIdx) return;
    switching = true;
    // feed-forward: the mark pulses BEFORE the copy resolves, telegraphing the change
    if (mark) mark.classList.add('pulse');
    setTimeout(() => {
      langIdx = idx;
      lang.classList.add('switching');                 // blur out
      setTimeout(() => {
        if (ttext) ttext.innerHTML = LANGS[idx].t;
        if (stmt) {
          stmt.classList.toggle('ko', !!LANGS[idx].ko);
          stmt.classList.toggle('jp', !!LANGS[idx].jp);
        }
        lang.classList.remove('switching');            // blur in
      }, 300);
      setTimeout(() => { if (mark) mark.classList.remove('pulse'); switching = false; }, 760);
    }, 420);                                            // 420ms of feed-forward before the change
  }

  // (auto language cycle disabled — headline copy is fixed)

  /* ---------- the coy mark: telegraphs interactivity, then dodges the cursor ---------- */
  let mpx = -9999, mpy = -9999;      // pointer position
  let mdx = 0, mdy = 0, msc = 1;     // mark's live offset + scale (spring state)
  let mhook = false;                 // one-time post-load attention hook
  if (mark && !RM) {
    addEventListener('pointermove', e => { mpx = e.clientX; mpy = e.clientY; }, { passive: true });
    addEventListener('pointerdown', e => { mpx = e.clientX; mpy = e.clientY; }, { passive: true });
    addEventListener('pointerout', e => { if (!e.relatedTarget) { mpx = mpy = -9999; } });
    addEventListener('blur', () => { mpx = mpy = -9999; });
    // a single visual hook ~2s after load — draws the eye once, then the mark stays composed
    setTimeout(() => {
      if (document.hidden) return;
      mark.classList.add('tell');
      mhook = true;
      setTimeout(() => { mark.classList.remove('tell'); }, 1200);
      setTimeout(() => { mhook = false; }, 1000);
    }, 2000);
  }

  /* ---------- the light: ambient drift (not cursor-reactive) ---------- */
  let gx = 0, gy = 0, idleT = 0;

  /* ---------- frame ---------- */
  function frame(now) {
    const time = now / 1000;
    idleT += 0.016;
    const gtx = W * 0.5 + Math.cos(idleT * 0.24) * W * 0.17;
    const gty = H * 0.46 + Math.sin(idleT * 0.31) * H * 0.13;
    gx += (gtx - gx) * 0.03; gy += (gty - gy) * 0.03;
    root.style.setProperty('--cx', gx.toFixed(1) + 'px');
    root.style.setProperty('--cy', gy.toFixed(1) + 'px');
    tmx += (gx / W - tmx) * 0.04; tmy += (gy / H - tmy) * 0.04;

    // coy mark: a calm, composed sidestep — perk on approach, glide aside when close, drift home when far
    if (mark) {
      const r = mark.getBoundingClientRect();
      const hx = r.left + r.width / 2 - mdx;          // home center (strip current offset)
      const hy = r.top + r.height / 2 - mdy;
      const dx = mpx - hx, dy = mpy - hy;
      const dist = Math.hypot(dx, dy);
      let tx = 0, ty = 0, ts = 1, near = false;
      if (mpx > -9000 && dist < 64) {                 // too close → glide calmly to the far side
        const ang = Math.atan2(dy, dx);
        tx = -Math.cos(ang) * 40; ty = -Math.sin(ang) * 40; ts = 1.0; near = true;
      } else if (mpx > -9000 && dist < 120) {         // approaching → a subtle perk
        ts = 1.08; near = true;
      } else if (mhook) {                             // one-time post-load hook
        ts = 1.24;
      }
      mdx += (tx - mdx) * 0.08; mdy += (ty - mdy) * 0.08; msc += (ts - msc) * 0.09;
      mark.style.transform = `translate(${mdx.toFixed(1)}px,${mdy.toFixed(1)}px) scale(${msc.toFixed(3)})`;
      mark.classList.toggle('near', near);
    }

    drawField(time);
    // drawContours(time); // contour lines removed — smooth wash only
    if (heroInView()) requestAnimationFrame(frame);
    else running = false;   // park the field while the hero is scrolled away — frees the main thread for lower sections
  }

  function paintNow() {
    root.style.setProperty('--cx', gx.toFixed(1) + 'px');
    root.style.setProperty('--cy', gy.toFixed(1) + 'px');
    drawField(0);
    // drawContours(0); // contour lines removed — smooth wash only
  }

  addEventListener('resize', resize);
  resize();
  addEventListener('load', resize);
  if (glow && !RM) setTimeout(() => glow.classList.add('live'), 300);

  let running = false;
  function heroInView() { return (window.pageYOffset || document.documentElement.scrollTop || 0) < innerHeight * 1.05; }
  function startLoop() { if (running || RM) return; running = true; requestAnimationFrame(frame); }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { resize(); startLoop(); } });
  addEventListener('scroll', () => { if (heroInView()) startLoop(); }, { passive: true });
  startLoop();
  setTimeout(resize, 400);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(resize);
})();
