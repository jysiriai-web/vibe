"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GalleryItem } from "@/lib/types";

interface Tile {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 드래그 평면 위의 마소닉 레이아웃 — 사진 수가 달라져도 대응한다.
 *  타일을 크게 잡아 평면이 컨테이너보다 가로·세로 모두 커지도록 한다.
 *  그래야 처음 화면에서 사진이 상하좌우 네 방향 모두 잘려 보이고,
 *  "아무 방향으로나 끌 수 있다"는 감각이 즉시 전달된다. */
export const TILE_W = 420;

function computeMasonry(items: GalleryItem[]) {
  const PAD = 96;
  const GAP = 48;
  const COLW = TILE_W;
  const n = Math.max(1, items.length);
  const cols = Math.max(3, Math.min(6, Math.round(Math.sqrt(n * 1.1))));
  const HSET = [510, 390, 580, 440, 530, 462, 390, 546];
  const colH: number[] = new Array(cols).fill(PAD);
  const tiles: Tile[] = items.map((_, i) => {
    let col = 0;
    for (let c = 1; c < cols; c++) if (colH[c] < colH[col]) col = c;
    const h = HSET[(i * 5) % HSET.length];
    const x = PAD + col * (COLW + GAP);
    const y = colH[col];
    colH[col] += h + GAP;
    return { x, y, w: COLW, h };
  });
  const planeW = PAD * 2 + cols * COLW + (cols - 1) * GAP;
  const planeH = Math.max(...colH, PAD * 2) + PAD;
  return { tiles, planeW, planeH };
}

export default function VisualCanvas({
  items,
  accent,
  onInteract,
}: {
  items: GalleryItem[];
  accent: string;
  /** 사용자가 처음 캔버스를 만졌을 때 한 번 — 인트로 카드를 걷어내는 신호 */
  onInteract?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const planeRef = useRef<HTMLDivElement>(null);
  const pos = useRef({ x: 0, y: 0 });
  const vel = useRef({ x: 0, y: 0 });
  const scaleRef = useRef(1);
  const dragging = useRef(false);
  const moved = useRef(false);
  const last = useRef({ x: 0, y: 0 });
  const raf = useRef<number | null>(null);
  const interacted = useRef(false);
  const [scale, setScale] = useState(1);
  const [ready, setReady] = useState(false);
  const [hinted, setHinted] = useState(false);
  const dims = useRef({ w: 1, h: 1 });
  const layout = useMemo(() => computeMasonry(items), [items]);

  const bounds = useCallback(() => {
    const c = containerRef.current;
    const s = scaleRef.current;
    const cw = c?.clientWidth ?? 0;
    const ch = c?.clientHeight ?? 0;
    return {
      minX: Math.min(0, cw - dims.current.w * s),
      maxX: 0,
      minY: Math.min(0, ch - dims.current.h * s),
      maxY: 0,
      cw,
      ch,
    };
  }, []);

  const apply = useCallback(() => {
    const p = planeRef.current;
    if (p)
      p.style.transform = `translate3d(${pos.current.x}px, ${pos.current.y}px, 0) scale(${scaleRef.current})`;
  }, []);

  const clamp = useCallback(() => {
    const b = bounds();
    pos.current.x = Math.max(b.minX, Math.min(b.maxX, pos.current.x));
    pos.current.y = Math.max(b.minY, Math.min(b.maxY, pos.current.y));
  }, [bounds]);

  const center = useCallback(() => {
    const b = bounds();
    pos.current.x = (b.cw - dims.current.w * scaleRef.current) / 2;
    pos.current.y = (b.ch - dims.current.h * scaleRef.current) / 2;
    clamp();
    apply();
  }, [bounds, clamp, apply]);

  const stopInertia = useCallback(() => {
    if (raf.current) {
      cancelAnimationFrame(raf.current);
      raf.current = null;
    }
  }, []);

  const startInertia = useCallback(() => {
    stopInertia();
    const step = () => {
      const b = bounds();
      vel.current.x *= 0.92;
      vel.current.y *= 0.92;
      pos.current.x += vel.current.x;
      pos.current.y += vel.current.y;
      const pull = 0.12;
      if (pos.current.x > b.maxX) {
        pos.current.x += (b.maxX - pos.current.x) * pull;
        vel.current.x *= 0.5;
      } else if (pos.current.x < b.minX) {
        pos.current.x += (b.minX - pos.current.x) * pull;
        vel.current.x *= 0.5;
      }
      if (pos.current.y > b.maxY) {
        pos.current.y += (b.maxY - pos.current.y) * pull;
        vel.current.y *= 0.5;
      } else if (pos.current.y < b.minY) {
        pos.current.y += (b.minY - pos.current.y) * pull;
        vel.current.y *= 0.5;
      }
      apply();
      const moving = Math.abs(vel.current.x) > 0.06 || Math.abs(vel.current.y) > 0.06;
      const out =
        pos.current.x > b.maxX + 0.4 ||
        pos.current.x < b.minX - 0.4 ||
        pos.current.y > b.maxY + 0.4 ||
        pos.current.y < b.minY - 0.4;
      if (moving || out) raf.current = requestAnimationFrame(step);
      else {
        clamp();
        apply();
        raf.current = null;
      }
    };
    raf.current = requestAnimationFrame(step);
  }, [bounds, apply, clamp, stopInertia]);

  // size + center on mount and whenever the photo set (layout) changes
  useEffect(() => {
    dims.current = { w: layout.planeW, h: layout.planeH };
    scaleRef.current = 1;
    setScale(1);
    interacted.current = false;
    center();
    setReady(true);
    const c = containerRef.current;
    const ro = new ResizeObserver(() => {
      if (interacted.current) {
        clamp();
        apply();
      } else {
        center();
      }
    });
    if (c) ro.observe(c);
    return () => {
      ro.disconnect();
      stopInertia();
    };
  }, [layout, center, clamp, apply, stopInertia]);

  function onPointerDown(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = true;
    interacted.current = true;
    moved.current = false;
    stopInertia();
    last.current = { x: e.clientX, y: e.clientY };
    vel.current = { x: 0, y: 0 };
    if (containerRef.current) containerRef.current.style.cursor = "grabbing";
    if (!hinted) {
      setHinted(true);
      onInteract?.();
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragging.current) return;
    const dx = e.clientX - last.current.x;
    const dy = e.clientY - last.current.y;
    if (Math.abs(dx) + Math.abs(dy) > 2) moved.current = true;
    last.current = { x: e.clientX, y: e.clientY };
    vel.current = { x: dx, y: dy };
    const b = bounds();
    let nx = pos.current.x + dx;
    let ny = pos.current.y + dy;
    if (nx > b.maxX) nx = b.maxX + (nx - b.maxX) * 0.4;
    else if (nx < b.minX) nx = b.minX + (nx - b.minX) * 0.4;
    if (ny > b.maxY) ny = b.maxY + (ny - b.maxY) * 0.4;
    else if (ny < b.minY) ny = b.minY + (ny - b.minY) * 0.4;
    pos.current.x = nx;
    pos.current.y = ny;
    apply();
  }

  function onPointerUp() {
    if (!dragging.current) return;
    dragging.current = false;
    if (containerRef.current) containerRef.current.style.cursor = "";
    startInertia();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const s = 150;
    let hit = true;
    if (e.key === "ArrowLeft") pos.current.x += s;
    else if (e.key === "ArrowRight") pos.current.x -= s;
    else if (e.key === "ArrowUp") pos.current.y += s;
    else if (e.key === "ArrowDown") pos.current.y -= s;
    else hit = false;
    if (hit) {
      e.preventDefault();
      interacted.current = true;
      if (!hinted) {
      setHinted(true);
      onInteract?.();
    }
      stopInertia();
      clamp();
      apply();
    }
  }

  function zoom(dir: 1 | -1) {
    const prev = scaleRef.current;
    const next = Math.max(0.7, Math.min(1.45, +(prev + dir * 0.15).toFixed(2)));
    if (next === prev) return;
    const b = bounds();
    const cx = b.cw / 2;
    const cy = b.ch / 2;
    const wx = (cx - pos.current.x) / prev;
    const wy = (cy - pos.current.y) / prev;
    scaleRef.current = next;
    pos.current.x = cx - wx * next;
    pos.current.y = cy - wy * next;
    clamp();
    apply();
    setScale(next);
  }

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div
        ref={containerRef}
        tabIndex={0}
        role="application"
        aria-label="비주얼 탐색 — 드래그하거나 방향키로 작업물을 둘러보세요"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        className="grab absolute inset-0 outline-none"
        style={{ touchAction: "none" }}
      >
        <div
          ref={planeRef}
          className="absolute left-0 top-0 will-change-transform"
          style={{
            width: layout.planeW,
            height: layout.planeH,
            transformOrigin: "0 0",
            opacity: ready ? 1 : 0,
            transition: "opacity .7s var(--ease)",
          }}
        >
          {items.map((it, i) => {
            const s = layout.tiles[i];
            if (!s) return null;
            return (
              <figure
                key={it.id}
                className="group absolute overflow-hidden rounded-[14px] bg-paper-2 shadow-[0_16px_36px_-26px_rgba(0,0,0,0.85)]"
                style={{ left: s.x, top: s.y, width: s.w, height: s.h }}
              >
                <Image
                  src={it.src}
                  alt={`@${it.handle}`}
                  fill
                  sizes="420px"
                  quality={68}
                  draggable={false}
                  className="select-none object-cover transition-transform duration-[1100ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.05]"
                />
                <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent_40%,rgba(0,0,0,0.74))] opacity-85 transition-opacity duration-500 group-hover:opacity-100" />
                <span
                  className="absolute left-3.5 top-3 h-1.5 w-1.5 rounded-full"
                  style={{ background: accent }}
                />
                <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 p-4 md:p-5">
                  {/* rest: reads as a data record already — @handle · followers */}
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="font-mono text-[0.82rem] text-white/95">@{it.handle}</p>
                    <p className="font-mono text-[0.74rem] tnum text-white/80">{it.followers}</p>
                  </div>
                  {/* hover: the record deepens — the clue that a full dataset exists */}
                  <div className="grid grid-rows-[0fr] opacity-0 transition-all duration-[450ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:mt-2 group-hover:grid-rows-[1fr] group-hover:opacity-100">
                    <div className="overflow-hidden">
                      <div className="flex items-center gap-2 font-mono text-[0.66rem] tnum text-white/85">
                        <span>
                          ER <b className="font-semibold text-white">{it.engagement}</b>
                        </span>
                        <span className="h-2.5 w-px bg-white/25" />
                        <span
                          className="rounded-full px-1.5 py-px text-[0.6rem] tracking-[0.06em]"
                          style={{ background: `${accent}22`, color: "#fff" }}
                        >
                          {it.tier}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="rounded-full bg-white/12 px-2 py-0.5 text-[0.62rem] text-white/85">
                          {it.category}
                        </span>
                        <span className="hairline-sm text-[0.56rem] uppercase text-white/55">
                          리스트 · 전체 데이터 →
                        </span>
                      </div>
                    </div>
                  </div>
                </figcaption>
              </figure>
            );
          })}
        </div>
      </div>

      {/* edge vignette — blends the field into the paper */}
      <div className="pointer-events-none absolute inset-0 z-[4] shadow-[inset_0_0_90px_24px_var(--color-paper)]" />

      {/* drag hint */}
      {!hinted && ready && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
          <div className="glass-soft flex items-center gap-2.5 rounded-full px-5 py-3">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M5 12h14M12 5v14M5 12l3-3M5 12l3 3M19 12l-3-3M19 12l-3 3M12 5l-3 3M12 5l3 3M12 19l-3-3M12 19l3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="text-sm text-ink">드래그하여 작업물을 둘러보세요</span>
          </div>
        </div>
      )}

      {/* zoom */}
      <div className="glass absolute bottom-5 right-5 z-10 flex flex-col overflow-hidden rounded-full">
        <button
          onClick={() => zoom(1)}
          aria-label="확대"
          disabled={scale >= 1.45}
          className="px-3.5 pb-2 pt-2.5 text-lg leading-none text-ink transition-colors hover:bg-white/45 disabled:opacity-35"
        >
          +
        </button>
        <span className="h-px w-full bg-line" />
        <button
          onClick={() => zoom(-1)}
          aria-label="축소"
          disabled={scale <= 0.7}
          className="px-3.5 pb-2.5 pt-2 text-lg leading-none text-ink transition-colors hover:bg-white/45 disabled:opacity-35"
        >
          −
        </button>
      </div>
    </div>
  );
}
