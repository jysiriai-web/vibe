"use client";

import { motion } from "motion/react";
import type { FollowerBucket } from "@/lib/types";

interface BarsProps {
  data: FollowerBucket[];
  accent: string;
}

export default function Bars({ data, accent }: BarsProps) {
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    /* items-stretch (not items-end): each column must fill the 168px track, or the
       bars' percentage heights resolve against a zero-height parent and vanish. */
    <div className="flex h-[210px] items-stretch gap-4">
      {data.map((d, i) => {
        const h = (d.value / max) * 100;
        return (
          <div key={d.label} className="flex flex-1 flex-col items-center gap-2.5">
            <div className="relative flex w-full flex-1 items-end">
              <motion.div
                className="w-full rounded-t-[2px]"
                style={{
                  background: `linear-gradient(to top, ${accent}, color-mix(in oklab, ${accent} 55%, var(--color-paper)))`,
                }}
                initial={{ height: 0 }}
                whileInView={{ height: `${h}%` }}
                viewport={{ once: true }}
                transition={{ duration: 0.85, delay: 0.08 * i, ease: [0.16, 1, 0.3, 1] }}
              >
                <span className="absolute -top-6 left-1/2 -translate-x-1/2 font-mono text-[0.78rem] tnum text-ink">
                  {d.value}
                </span>
              </motion.div>
            </div>
            <span className="text-center font-mono text-[0.68rem] hairline-sm leading-tight text-muted uppercase">
              {d.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
