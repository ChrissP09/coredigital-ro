# Core Web Blueprint

Reusable blueprint for fast static websites built with Astro, Tailwind CSS, BEM, and variable-first design tokens.

## Tech Stack
- Astro (static output)
- Tailwind CSS (design system + utilities)
- BEM CSS architecture via `@apply`
- PostCSS + Autoprefixer

## Development
```bash
npm install
npm run dev
```

## Production Build
```bash
npm run build
```

## Deploy to Hostinger
- Upload the contents of `/dist` to `public_html`.

## Add a Page
1. Create a file in `src/pages/` (e.g., `servicii.astro`).
2. Use `BaseLayout` and include exactly one `h1`.

## Add a Component
1. Create the component in `src/components/` or `src/components/ui/`.
2. Add styles in `src/styles/components/` using BEM classes.
3. Use Tailwind utilities via `@apply` inside the component CSS.
4. Import the component CSS in `src/styles/main.css`.

## Styling Rules (BEM-first + Tailwind @apply)
- HTML uses BEM classes (no utility soup in markup).
- Tailwind utilities live in CSS via `@apply`.
- One-off utilities in HTML should be rare and minimal.

## Tokens / Variables
- Single source of truth: `src/styles/base/tokens.css`.
- Colors, fonts, radii, shadows are CSS variables.
- Tailwind theme references these variables in `tailwind.config.cjs`.

## Heading Hierarchy
- Exactly one `h1` per page.
- Use `h2` → `h3` → `h4` in order (no jumps).
