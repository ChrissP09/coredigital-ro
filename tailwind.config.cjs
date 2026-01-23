/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{astro,html,js,jsx,ts,tsx,md,mdx}'],
  theme: {
    extend: {
      colors: {
        brand: 'hsl(var(--color-brand-blue) / <alpha-value>)',
        reviews: 'hsl(var(--color-reviews-green) / <alpha-value>)',
        ai: 'hsl(var(--color-ai-purple) / <alpha-value>)',
        ink: 'hsl(var(--color-text) / <alpha-value>)',
        muted: 'hsl(var(--color-muted) / <alpha-value>)',
        bg: 'hsl(var(--color-bg) / <alpha-value>)',
        surface: 'hsl(var(--color-surface) / <alpha-value>)',
        border: 'hsl(var(--color-border) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
        display: ['var(--font-display)'],
      },
      boxShadow: {
        soft: 'var(--shadow-soft)',
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
