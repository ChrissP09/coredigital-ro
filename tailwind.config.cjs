/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{astro,html,js,jsx,ts,tsx,md,mdx}'],
  safelist: ['translate-x-0'],
  theme: {
    extend: {
      colors: {
        primary: {
          50:  '#f7ffe5',
          100: '#edffc0',
          200: '#d9fd85',
          300: '#c4f74a',
          400: '#b3f031',
          600: '#a3e635',
          700: '#84cc16',
          800: '#65a30d',
          900: '#3f6212',
        },
        sky: {
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
        },
        zinc: {
          700: '#3f3f46',
          800: '#27272a',
          850: '#1e1e21',
          900: '#18181b',
          950: '#0f0f11',
        },
        brand: 'hsl(var(--color-lime) / <alpha-value>)',
        reviews: 'hsl(var(--color-lime) / <alpha-value>)',
        ai: 'hsl(var(--color-sky) / <alpha-value>)',
        ink: 'hsl(var(--color-text) / <alpha-value>)',
        muted: 'hsl(var(--color-muted) / <alpha-value>)',
        bg: 'hsl(var(--color-bg) / <alpha-value>)',
        surface: 'hsl(var(--color-surface) / <alpha-value>)',
        border: 'hsl(var(--color-border) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
        display: ['var(--font-display)'],
        mono: ['var(--font-mono)'],
      },
      boxShadow: {
        soft: 'var(--shadow-soft)',
        card: 'var(--shadow-card)',
        lime: 'var(--shadow-lime)',
        sky: 'var(--shadow-sky)',
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
      },
      backgroundImage: {
        hero: 'var(--gradient-hero)',
      },
    },
  },
  plugins: [],
};
