"use client";

import { motion } from "motion/react";
import type { CategorySlice } from "@/lib/types";

interface DonutProps {
  data: CategorySlice[];
  accent: string;
}

const WEIGHTS = [100, 74, 52, 34, 22];

export default function Donut({ data, accent }: DonutProps) {
  const size = 210;
  const stroke = 28;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const total = data.reduce((s, d) => s + d.pct, 0) || 100;

  let offset = 0;
  const slices = data.map((d, i) => {
    const len = (d.pct / total) * c;
    const slice = {
      ...d,
      len,
      gap: c - len,
      dashoffset: -offset,
      color: `color-mix(in oklab, ${accent} ${WEIGHTS[i] ?? 18}%, var(--color-paper))`,
    };
    offset += len;
    return slice;
  });

  return (
    <div className="flex items-center gap-6">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--color-line-2)"
            strokeWidth={stroke}
            opacity={1}
          />
          {slices.map((s, i) => (
            <motion.circle
              key={s.name}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={stroke}
              strokeDasharray={`${s.len} ${s.gap}`}
              initial={{ strokeDashoffset: -c }}
              whileInView={{ strokeDashoffset: s.dashoffset }}
              viewport={{ once: true }}
              transition={{ duration: 0.95, delay: 0.12 * i, ease: [0.16, 1, 0.3, 1] }}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-[0.68rem] hairline-sm text-muted uppercase">Mix</span>
          <span className="font-display text-3xl leading-none">{data.length}</span>
        </div>
      </div>

      <ul className="flex-1 space-y-3.5">
        {slices.map((s) => (
          <li key={s.name} className="flex items-center justify-between text-base">
            <span className="flex items-center gap-3">
              <span
                className="h-3 w-3 rounded-full"
                style={{ background: s.color }}
              />
              <span className="text-ink-soft">{s.name}</span>
            </span>
            <span className="font-mono text-sm tnum text-ink">{s.pct}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
