/* ============================================================
   Cathy Dolle — clone / interactions
   ============================================================ */
(() => {
  "use strict";

  /* ---------- Build project name columns ---------- */
  const leftEl = document.getElementById("projectsLeft");
  const rightEl = document.getElementById("projectsRight");
  const nameEls = [];

  PROJECTS.forEach((p, i) => {
    const li = document.createElement("li");
    li.className = "project";
    li.dataset.idx = i;
    li.innerHTML =
      `<span class="project__num">${p.num}/</span>` +
      `<span class="project__name">${p.name}</span>`;
    (i < 6 ? leftEl : rightEl).appendChild(li);
    nameEls[i] = li;
    li.addEventListener("mouseenter", () => holdOn(i));
    li.addEventListener("mouseleave", holdOff);
  });

  /* ---------- Build the reel (two stacked copies for a seamless loop) ---------- */
  const track = document.getElementById("reelTrack");

  function buildCopy(copy) {
    PROJECTS.forEach((p, i) => {
      const tile = document.createElement("div");
      tile.className = "tile";
      tile.dataset.idx = i;
      tile.dataset.copy = copy;
      tile.style.height = p.h + "px";
      tile.innerHTML = renderArt(p, `${copy}_${i}`);
      track.appendChild(tile);
    });
  }
  buildCopy(0);
  buildCopy(1);

  const firstCopyTiles = [...track.querySelectorAll('.tile[data-copy="0"]')];
  const allTiles = [...track.querySelectorAll('.tile')];

  /* one-copy height (content + gaps) */
  function copyHeight() {
    const gap = parseFloat(getComputedStyle(track).gap) || 0;
    return PROJECTS.reduce((s, p) => s + p.h, 0) + gap * PROJECTS.length;
  }
  let setH = copyHeight();
  window.addEventListener("resize", () => { setH = copyHeight(); });

  /* ---------- Reel animation ---------- */
  let offset = 0;          // px scrolled
  let target = null;       // null → free auto-scroll; number → ease to it
  const SPEED = 0.45;      // auto-scroll px per frame
  let activeIdx = -1;

  function holdOn(i) {
    // ease the reel so project i's nearest tile-copy lands at viewport centre
    const mid = window.innerHeight / 2;
    let tile = firstCopyTiles[i], bestD = Infinity;
    allTiles.forEach((t) => {
      if (+t.dataset.idx !== i) return;
      const r = t.getBoundingClientRect();
      const d = Math.abs(r.top + r.height / 2 - mid);
      if (d < bestD) { bestD = d; tile = t; }
    });
    const r = tile.getBoundingClientRect();
    const delta = r.top + r.height / 2 - mid;
    target = offset + delta;
  }
  function holdOff() { target = null; }

  function setActive(i) {
    if (i === activeIdx) return;
    if (activeIdx > -1) nameEls[activeIdx].classList.remove("is-active");
    activeIdx = i;
    nameEls[i].classList.add("is-active");
  }

  function updateActive() {
    const mid = window.innerHeight / 2;
    let best = 0, bestD = Infinity;
    for (const t of allTiles) {
      const r = t.getBoundingClientRect();
      const d = Math.abs(r.top + r.height / 2 - mid);
      if (d < bestD) { bestD = d; best = +t.dataset.idx; }
    }
    setActive(best);
  }

  function frame() {
    if (target === null) {
      offset += SPEED;
    } else {
      offset += (target - offset) * 0.09;
    }
    // wrap within a single copy so copy #2 covers the seam
    if (offset >= setH) { offset -= setH; if (target !== null) target -= setH; }
    if (offset < 0) { offset += setH; if (target !== null) target += setH; }

    track.style.transform = `translate3d(0, ${-offset}px, 0)`;
    updateActive();
    requestAnimationFrame(frame);
  }
  // start reel slightly above centre so the first tiles animate into view
  offset = -window.innerHeight * 0.35;
  requestAnimationFrame(frame);

  /* ---------- List / Slider toggle ---------- */
  const toggleBtns = [...document.querySelectorAll(".toggle-btn")];
  toggleBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      toggleBtns.forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      document.body.dataset.view = btn.dataset.view;
    });
  });

  /* ---------- About overlay ----------
     Stays open while the pointer is over the "about" trigger OR the panel
     content; a short grace timer bridges the gap between the two. */
  const about = document.getElementById("about");
  const aboutTrigger = document.getElementById("aboutTrigger");
  const aboutGrid = about.querySelector(".about__grid");
  let closeTimer = null;
  let aboutLock = false;

  const openAbout = () => { clearTimeout(closeTimer); about.classList.add("is-open"); };
  const closeAbout = () => { if (!aboutLock) about.classList.remove("is-open"); };
  const scheduleClose = () => { clearTimeout(closeTimer); closeTimer = setTimeout(closeAbout, 80); };

  aboutTrigger.addEventListener("mouseenter", openAbout);
  aboutTrigger.addEventListener("mouseleave", scheduleClose);
  aboutGrid.addEventListener("mouseenter", openAbout);
  aboutGrid.addEventListener("mouseleave", scheduleClose);

  aboutTrigger.addEventListener("click", (e) => {
    e.preventDefault();
    aboutLock = !aboutLock;
    if (aboutLock) openAbout(); else about.classList.remove("is-open");
  });
  about.addEventListener("click", (e) => {
    if (e.target === about) { aboutLock = false; about.classList.remove("is-open"); }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { aboutLock = false; about.classList.remove("is-open"); }
  });

  /* ---------- Custom cursor ---------- */
  const cursor = document.getElementById("cursor");
  let cx = window.innerWidth / 2, cy = window.innerHeight / 2;
  let tx = cx, ty = cy;

  window.addEventListener("mousemove", (e) => { tx = e.clientX; ty = e.clientY; });
  (function cursorLoop() {
    cx += (tx - cx) * 0.25;
    cy += (ty - cy) * 0.25;
    cursor.style.transform = `translate(${cx}px, ${cy}px) translate(-50%, -50%)`;
    requestAnimationFrame(cursorLoop);
  })();

  const hoverSel = "a, button, .project, .toggle-btn";
  document.addEventListener("mouseover", (e) => {
    if (e.target.closest(hoverSel)) cursor.classList.add("is-hover");
  });
  document.addEventListener("mouseout", (e) => {
    if (e.target.closest(hoverSel)) cursor.classList.remove("is-hover");
  });

  /* ---------- Intro loader ---------- */
  const loader = document.getElementById("loader");
  window.addEventListener("load", () => {
    setTimeout(() => loader.classList.add("is-done"), 900);
  });
  // fallback in case 'load' already fired
  setTimeout(() => loader.classList.add("is-done"), 1800);
})();
