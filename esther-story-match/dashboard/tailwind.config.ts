import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['-apple-system', 'Apple SD Gothic Neo', 'Noto Sans KR', 'sans-serif'],
      },
      colors: {
        stone: { 50: '#fafaf9', 100: '#f5f5f3', 200: '#e8e8e4' },
      },
    },
  },
  plugins: [],
};

export default config;
