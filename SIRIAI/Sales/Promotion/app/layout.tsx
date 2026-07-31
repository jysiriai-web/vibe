import type { Metadata, Viewport } from "next";
import "./globals.css";
import BrandCursor from "@/components/BrandCursor";

export const metadata: Metadata = {
  title: "SIRIAI · Creator Intelligence for Beauty",
  description:
    "인터참 2026 — 브랜드별 맞춤 크리에이터 인텔리전스. 비주얼과 데이터를 한 화면에서.",
  metadataBase: new URL("https://siriai.co.kr"),
  icons: { icon: "/brand/mark-white.png" },
  openGraph: {
    title: "SIRIAI · Creator Intelligence for Beauty",
    description: "브랜드별 맞춤 크리에이터 인텔리전스 — INTERCHARM 2026",
    type: "website",
  },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <head>
        {/* Brand type — identical stack to the cd-study design system.
            CDN (not next/font) because Noto Sans KR relies on unicode-range
            subsetting; self-hosting every Korean glyph would be enormous. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter+Tight:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&family=Noto+Sans+KR:wght@300;400;500;600;700&family=Noto+Sans+JP:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
        <BrandCursor />
      </body>
    </html>
  );
}
