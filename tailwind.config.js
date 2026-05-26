/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx,html}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#06101f',
          soft: '#0a1628',
          card: 'rgba(255,255,255,0.025)',
          elevated: 'rgba(255,255,255,0.045)'
        },
        line: {
          DEFAULT: 'rgba(255,255,255,0.06)',
          strong: 'rgba(255,255,255,0.12)'
        },
        ink: {
          DEFAULT: '#e6edf7',
          soft: '#9aa6b8',
          dim: '#5a667a'
        },
        brand: {
          primary: '#f59e0b',
          success: '#22c55e',
          info: '#3b82f6',
          warn: '#eab308',
          danger: '#ef4444',
          purple: '#a855f7'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Consolas', 'monospace']
      },
      borderRadius: {
        xl: '14px',
        '2xl': '18px',
        '3xl': '24px'
      },
      boxShadow: {
        card: '0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 24px rgba(0,0,0,0.35)',
        glow: '0 0 0 1px rgba(34,197,94,0.4), 0 0 32px rgba(34,197,94,0.15)',
        'glow-amber': '0 0 0 1px rgba(245,158,11,0.5), 0 0 32px rgba(245,158,11,0.2)'
      },
      keyframes: {
        'fade-in': { '0%': { opacity: '0', transform: 'translateY(4px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        shake: { '0%,100%': { transform: 'translateX(0)' }, '20%,60%': { transform: 'translateX(-6px)' }, '40%,80%': { transform: 'translateX(6px)' } }
      },
      animation: {
        'fade-in': 'fade-in 200ms ease-out',
        shake: 'shake 360ms ease-in-out'
      }
    }
  },
  plugins: []
}
