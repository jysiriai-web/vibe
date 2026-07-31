import Link from "next/link";
import SiriMark from "@/components/SiriMark";
import { HOMEPAGE_URL } from "@/lib/links";

export default function NotFound() {
  return (
    <main className="relative grid min-h-dvh place-items-center px-6">
      <div className="field-bg" aria-hidden />
      <div className="relative z-10 max-w-md text-center">
        <a
          href={HOMEPAGE_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="SIRIAI 홈페이지"
          className="inline-block transition-opacity hover:opacity-70"
        >
          <SiriMark className="justify-center" variant="white" />
        </a>
        <p className="mt-8 kicker">Code not found</p>
        <h1 className="mt-4 font-display text-[clamp(2rem,5vw,3rem)] font-medium leading-tight tracking-[-0.025em]">
          확인되지 않는 코드입니다.
        </h1>
        <p className="mt-4 text-[0.95rem] leading-relaxed text-ink-2 text-pretty">
          메일에 안내된 초대 코드를 다시 확인해 주세요. 코드는 회사별로 발급되며, 대소문자는 구분하지
          않습니다.
        </p>
        <Link
          href="/"
          className="btn-ink mt-8 inline-flex items-center gap-2 rounded-full px-6 py-3.5 text-sm"
        >
          ← 코드 다시 입력하기
        </Link>
      </div>
    </main>
  );
}
