/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // 深蓝灰 / 暗紫灰 — 沉浸式背景
        ink: {
          950: '#0b0f16',
          900: '#10151f',
          850: '#151b28',
          800: '#1b2231',
          700: '#242d3f',
          600: '#313c52',
          500: '#43506b',
          400: '#5d6b87',
          300: '#8794ad',
          200: '#b3bccd',
          100: '#dde2ec',
        },
        // 纸张
        paper: {
          DEFAULT: '#f7f3ea',
          warm: '#f4ece0',
          cool: '#f2f3f0',
          aged: '#efe6d6',
          edge: '#e0d7c6',
        },
        // 强调色（克制的手账墨色）
        clay: {
          600: '#a8503a',
          500: '#c2603f',
          400: '#d97d5a',
        },
        moss: {
          600: '#4a6b52',
          500: '#5d8163',
        },
        dusk: {
          600: '#4b5b86',
          500: '#61729f',
        },
        kraft: {
          600: '#b98f5e',
          500: '#cba87a',
          400: '#dcc19b',
        },
      },
      fontFamily: {
        sans: [
          '"Inter"',
          '"PingFang SC"',
          '"Hiragino Sans GB"',
          '"Microsoft YaHei"',
          '"Source Han Sans SC"',
          '"Noto Sans SC"',
          'system-ui',
          'sans-serif',
        ],
        serif: [
          '"Noto Serif SC"',
          '"Songti SC"',
          '"SimSun"',
          'Georgia',
          'serif',
        ],
        hand: [
          '"Ma Shan Zheng"',
          '"LXGW WenKai"',
          '"Kaiti SC"',
          '"STKaiti"',
          'KaiTi',
          'cursive',
        ],
        handen: ['"Caveat"', '"Segoe Script"', 'cursive'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        book: '0 32px 64px -20px rgba(0,0,0,0.72), 0 8px 24px -8px rgba(0,0,0,0.5)',
        page: '0 1px 2px rgba(0,0,0,0.06), 0 12px 28px -14px rgba(0,0,0,0.35)',
        photo: '0 6px 16px -6px rgba(0,0,0,0.45), 0 1px 2px rgba(0,0,0,0.2)',
        lift: '0 18px 32px -16px rgba(0,0,0,0.55)',
        inset: 'inset 0 1px 0 rgba(255,255,255,0.06)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'pop-in': {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'toast-in': {
          '0%': { opacity: '0', transform: 'translateY(12px) scale(0.98)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.32s cubic-bezier(0.22, 1, 0.36, 1) both',
        'fade-in': 'fade-in 0.24s ease both',
        'pop-in': 'pop-in 0.18s cubic-bezier(0.22, 1, 0.36, 1) both',
        'toast-in': 'toast-in 0.26s cubic-bezier(0.22, 1, 0.36, 1) both',
        shimmer: 'shimmer 2.2s linear infinite',
      },
    },
  },
  plugins: [],
}
