import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '에스더버니 × SIRIAI — 스토리 매칭 리포트',
  description: '에스더버니 팝업 인플루언서 스토리 업로드 현황',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="antialiased" style={{ background: '#FAF8F5', color: '#1a1a1a' }}>
        {children}
      </body>
    </html>
  );
}
