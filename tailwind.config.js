/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx,html}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#f8fafc',
          soft: '#f1f5f9',
          card: '#ffffff',
          elevated: '#f8fafc'
        },
        line: {
          DEFAULT: '#e2e8f0',
          strong: '#cbd5e1'
        },
        ink: {
          DEFAULT: '#0f172a',
          soft: '#64748b',
          dim: '#94a3b8'
        },
        brand: {
          primary: '#2563eb',
          success: '#16a34a',
          info: '#0ea5e9',
          warn: '#d97706',
          danger: '#dc2626',
          purple: '#7c3aed'
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
        card: '0 1px 3px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.06)',
        'card-hover': '0 4px 16px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06)',
        glow: '0 0 0 2px rgba(22,163,74,0.25), 0 4px 16px rgba(22,163,74,0.12)',
        'glow-blue': '0 0 0 2px rgba(37,99,235,0.25), 0 4px 16px rgba(37,99,235,0.12)'
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
