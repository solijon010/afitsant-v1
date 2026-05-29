/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx,html}'],
  darkMode: 'class',
  theme: {
    extend: {
      /* ─── shadcn/ui CSS variable-based tokens ─── */
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },

        /* Mavjud brand tokenlar — eski komponentlar uchun */
        bg: {
          DEFAULT: '#F5F5F4',
          soft: '#F0EDE8',
          card: '#FFFFFF',
          elevated: '#EDE8DD',
          dark: '#2c1810',
        },
        line: {
          DEFAULT: '#E7E5E4',
          strong: '#D6D3D1',
        },
        ink: {
          DEFAULT: '#1C1917',
          soft: '#57534E',
          dim: '#A8A29E',
        },
        brand: {
          primary: '#C2410C',
          success: '#16A34A',
          info: '#4a7fa5',
          warn: '#F59E0B',
          danger: '#DC2626',
          purple: '#7c5c8a',
        },
      },

      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        serif: ['Georgia', '"Times New Roman"', 'serif'],
        mono: ['JetBrains Mono', 'Consolas', 'monospace'],
      },

      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        xl: '14px',
        '2xl': '18px',
        '3xl': '24px',
      },

      boxShadow: {
        card: '0 1px 4px rgba(28,25,23,0.06), 0 1px 2px rgba(28,25,23,0.04)',
        'card-hover': '0 4px 16px rgba(28,25,23,0.10), 0 2px 6px rgba(28,25,23,0.06)',
        warm: '0 4px 16px rgba(194,65,12,0.18)',
        glow: '0 0 0 2px rgba(22,163,74,0.25), 0 4px 16px rgba(22,163,74,0.12)',
        'glow-primary': '0 0 0 2px rgba(194,65,12,0.2), 0 4px 16px rgba(194,65,12,0.12)',
      },

      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shake: {
          '0%,100%': { transform: 'translateX(0)' },
          '20%,60%': { transform: 'translateX(-6px)' },
          '40%,80%': { transform: 'translateX(6px)' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },

      animation: {
        'fade-in': 'fade-in 220ms ease-out',
        shake: 'shake 360ms ease-in-out',
        'slide-up': 'slide-up 250ms ease-out',
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
