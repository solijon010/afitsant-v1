/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx,html}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#faf8f4',
          soft: '#f5efe6',
          card: '#ffffff',
          elevated: '#ede8dd',
          dark: '#2c1810'
        },
        line: {
          DEFAULT: '#e0d8cc',
          strong: '#c8bfb4'
        },
        ink: {
          DEFAULT: '#2c1810',
          soft: '#6b4f3a',
          dim: '#9c7f6a'
        },
        brand: {
          primary: '#d4622a',
          success: '#2d8a4e',
          info: '#4a7fa5',
          warn: '#c9a030',
          danger: '#c0392b',
          purple: '#7c5c8a'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        serif: ['Georgia', '"Times New Roman"', 'serif'],
        mono: ['JetBrains Mono', 'Consolas', 'monospace']
      },
      borderRadius: {
        xl: '14px',
        '2xl': '18px',
        '3xl': '24px'
      },
      boxShadow: {
        card: '0 2px 8px rgba(44,24,16,0.08), 0 1px 3px rgba(44,24,16,0.05)',
        'card-hover': '0 6px 20px rgba(44,24,16,0.12), 0 2px 6px rgba(44,24,16,0.06)',
        warm: '0 4px 16px rgba(212,98,42,0.18)',
        glow: '0 0 0 2px rgba(45,138,78,0.25), 0 4px 16px rgba(45,138,78,0.12)',
        'glow-orange': '0 0 0 2px rgba(212,98,42,0.2), 0 4px 16px rgba(212,98,42,0.12)'
      },
      keyframes: {
        'fade-in': { '0%': { opacity: '0', transform: 'translateY(4px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        shake: { '0%,100%': { transform: 'translateX(0)' }, '20%,60%': { transform: 'translateX(-6px)' }, '40%,80%': { transform: 'translateX(6px)' } },
        'slide-up': { '0%': { opacity: '0', transform: 'translateY(8px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } }
      },
      animation: {
        'fade-in': 'fade-in 220ms ease-out',
        shake: 'shake 360ms ease-in-out',
        'slide-up': 'slide-up 250ms ease-out'
      }
    }
  },
  plugins: []
}
