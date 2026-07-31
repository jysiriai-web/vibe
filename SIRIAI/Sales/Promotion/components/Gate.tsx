"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import SiriMark from "./SiriMark";
import GateCanvas from "./GateCanvas";
import GateLoader from "./GateLoader";
import { verifyCode, type VerifyResult } from "@/lib/actions";
import { HOMEPAGE_URL } from "@/lib/links";

type Status = "idle" | "verifying" | "success" | "error";

export default function Gate() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "verifying" || status === "success") return;
    if (!value.trim()) {
      setError("코드를 입력해 주세요.");
      setStatus("error");
      return;
    }
    setStatus("verifying");
    setError("");
    const res = await verifyCode(value);
    if (res.ok) {
      setResult(res);
      setStatus("success");
      setTimeout(() => router.push(`/space/${res.code}`), 1050);
    } else {
      setError(res.message ?? "확인되지 않는 코드입니다.");
      setStatus("error");
    }
  }

  return (
    <main className="relative min-h-dvh overflow-hidden">
      <GateLoader onDone={() => setReady(true)} />
      <GateCanvas />

      <header
        className="relative z-10 flex items-center justify-between transition-[opacity,transform] duration-[900ms] ease-out"
        style={{
          padding: "var(--pad-hero)",
          opacity: ready ? 1 : 0,
          transform: ready ? "none" : "translateY(10px)",
          transitionDelay: "0.15s",
        }}
      >
        <a
          href={HOMEPAGE_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="SIRIAI 홈페이지"
          className="transition-opacity hover:opacity-70"
        >
          <SiriMark variant="white" />
        </a>
        <span className="kicker">INTERCHARM&nbsp;SEOUL&nbsp;2026</span>
      </header>

      <div
        className="relative z-10 mx-auto grid min-h-[calc(100dvh-220px)] max-w-[1440px] items-center gap-16 md:grid-cols-[1.12fr_0.88fr]"
        style={{ paddingInline: "var(--pad-hero)" }}
      >
        {/* editorial column */}
        <motion.section
          initial="hidden"
          animate={ready ? "show" : "hidden"}
          variants={{ show: { transition: { staggerChildren: 0.08, delayChildren: 0.08 } } }}
        >
          <Reveal>
            <p className="label-arrow">Invite</p>
          </Reveal>
          <Reveal>
            <h1 className="lead mt-6 font-display">
              당신의 브랜드를 위한
              <br />
              크리에이터 인텔리전스.
            </h1>
          </Reveal>
          <Reveal>
            <p className="lead-sub mt-6 max-w-lg leading-[1.7]">
              메일로 받으신 <span className="text-ink">초대 코드</span>를 입력하시면, 브랜드의 감도와
              카테고리에 맞는 크리에이터 라인업과 캠페인 데이터를 한 화면에서 확인하실 수 있습니다.
            </p>
          </Reveal>
        </motion.section>

        {/* code card */}
        <motion.section
          initial={{ opacity: 0, y: 24 }}
          animate={ready ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.22 }}
        >
          <div className="glass relative rounded-[20px] p-7 md:p-9">
            <AnimatePresence mode="wait">
              {status === "success" && result ? (
                <motion.div
                  key="success"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center py-10 text-center"
                >
                  <motion.div
                    initial={{ scale: 0.4, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 220, damping: 16 }}
                  >
                    <EyeCheck />
                  </motion.div>
                  <p className="mt-6 kicker">Verified</p>
                  <p className="mt-2 font-display text-2xl font-semibold tracking-[-0.02em]">
                    {result.brand}
                  </p>
                  <p className="mt-1 text-sm text-ink-2">{result.segmentLabel}</p>
                  <p className="mt-5 kicker">맞춤 페이지로 이동합니다…</p>
                </motion.div>
              ) : (
                <motion.form
                  key="form"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onSubmit={handleSubmit}
                >
                  <label htmlFor="code" className="kicker">
                    Invite Code
                  </label>

                  <motion.div
                    animate={status === "error" ? { x: [0, -9, 8, -6, 4, 0] } : {}}
                    transition={{ duration: 0.42 }}
                    className="relative mt-3"
                  >
                    <input
                      id="code"
                      ref={inputRef}
                      value={value}
                      onChange={(e) => {
                        setValue(e.target.value);
                        if (status === "error") setStatus("idle");
                      }}
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="ABC1234"
                      disabled={status === "verifying"}
                      className="w-full bg-transparent pb-3 font-display text-2xl uppercase tracking-[0.14em] text-ink placeholder:text-ink-3 outline-none disabled:opacity-50"
                    />
                    <span className="absolute bottom-0 left-0 h-px w-full bg-line" />
                    <motion.span
                      className="absolute bottom-0 left-0 h-[1.5px]"
                      style={{ background: "var(--color-ink)" }}
                      initial={{ width: "0%" }}
                      animate={{ width: value ? "100%" : "0%" }}
                      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                    />
                  </motion.div>

                  <div className="mt-3 h-5">
                    <AnimatePresence>
                      {status === "error" && error && (
                        <motion.p
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          className="text-[0.78rem]"
                          style={{ color: "#ff8a6b" }}
                        >
                          {error}
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </div>

                  <button
                    type="submit"
                    disabled={status === "verifying"}
                    className="btn-ink mt-5 w-full justify-between px-[1.5em] py-[0.86em] text-[max(13px,0.849vw)] disabled:opacity-60"
                  >
                    <span>{status === "verifying" ? "확인하는 중…" : "확인하고 입장"}</span>
                    {status === "verifying" ? (
                      <motion.span
                        className="flex"
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 0.9, ease: "linear" }}
                      >
                        <Aperture />
                      </motion.span>
                    ) : (
                      <ArrowUpRight />
                    )}
                  </button>
                </motion.form>
              )}
            </AnimatePresence>
          </div>

          {/* 데모 코드 UI는 노출하지 않는다 — 인플루언서 풀이 넓지 않아 데모를 먼저 보면
              자사 코드로 들어와도 "데모랑 똑같네"가 되어 개인화 경험이 깎인다.
              DEMO-COLOR / DEMO-SKIN 코드 자체는 유효하므로 필요할 때 직접 입력해 시연할 수 있다. */}
        </motion.section>
      </div>

      <footer
        className="relative z-10 flex items-center justify-between kicker transition-[opacity,transform] duration-[900ms] ease-out"
        style={{
          padding: "var(--pad-hero)",
          opacity: ready ? 1 : 0,
          transform: ready ? "none" : "translateY(10px)",
          transitionDelay: "0.3s",
        }}
      >
        <span>© 2026 SIRIAI</span>
        <span>Signal · Structure · Decision</span>
      </footer>
    </main>
  );
}

/* ── helpers ─────────────────────────────────────────────── */

function Reveal({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 16 },
        show: { opacity: 1, y: 0, transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] } },
      }}
    >
      {children}
    </motion.div>
  );
}

/** the system's canonical diagonal ↗ — every external/forward CTA uses this exact path */
function ArrowUpRight() {
  return (
    <svg viewBox="0 0 15 15" fill="none" aria-hidden xmlns="http://www.w3.org/2000/svg">
      <path
        d="M4 11L11 4M11 4H5.5M11 4V9.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Aperture() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" opacity="0.35" />
      <path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function EyeCheck() {
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
      <circle cx="28" cy="28" r="26" stroke="var(--color-ink)" strokeWidth="1.3" opacity="0.4" />
      <motion.path
        d="M19 28.5L25 34.5L38 21"
        stroke="var(--color-ink)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.5, delay: 0.15, ease: "easeOut" }}
      />
    </svg>
  );
}
