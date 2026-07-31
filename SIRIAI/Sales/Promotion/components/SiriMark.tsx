/* eslint-disable @next/next/no-img-element */

interface SiriMarkProps {
  className?: string;
  variant?: "ink" | "white";
  /** show the SIRIAI wordmark image alongside the glyph */
  withWordmark?: boolean;
  height?: number;
}

/** Real SIRIAI brand mark (assets ported from siriai-homepage). */
export default function SiriMark({
  className = "",
  variant = "ink",
  withWordmark = true,
  height = 18,
}: SiriMarkProps) {
  return (
    <span className={`inline-flex items-center gap-3 ${className}`}>
      <img
        src={`/brand/mark-${variant}.png`}
        alt="SIRIAI"
        height={height}
        style={{ height, width: "auto" }}
        className="block object-contain"
      />
      {withWordmark && (
        <span
          className="kicker"
          style={{
            color: variant === "white" ? "rgba(255,255,255,.7)" : undefined,
            paddingLeft: 13,
            borderLeft: `1px solid ${variant === "white" ? "rgba(255,255,255,.2)" : "var(--color-line)"}`,
            letterSpacing: "0.22em",
            fontSize: 10,
          }}
        >
          Creator Intelligence
        </span>
      )}
    </span>
  );
}
