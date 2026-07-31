import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// SIRIAI 사업소개 V3 — 로컬 개발 전용 (배포는 최종 확정 시 별도)
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: false,
  },
})
