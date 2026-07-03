import type { Config } from 'tailwindcss';

// Colors/fonts/radii map onto the CSS custom properties defined in app/globals.css
// (the single source of truth for brand tokens — mirrored from the explorer). Because the
// tokens flip via [data-theme], components using these utilities auto-theme with no `dark:` variant.
export default {
  darkMode: ['selector', '[data-theme="dark"]'],
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        blue: 'var(--blue)',
        'blue-brand': 'var(--blue-brand)',
        'blue-soft': 'var(--blue-soft)',
        gold: 'var(--gold)',
        mint: 'var(--mint)',
        coral: 'var(--coral)',
        lavender: 'var(--lavender)',
        'bg-primary': 'var(--bg-primary)',
        'bg-card': 'var(--bg-card)',
        'bg-card-hover': 'var(--bg-card-hover)',
        'bg-surface': 'var(--bg-surface)',
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-tertiary': 'var(--text-tertiary)',
        line: 'var(--border)',
        'line-hover': 'var(--border-hover)',
      },
      borderColor: {
        DEFAULT: 'var(--border)',
      },
      fontFamily: {
        sans: ['var(--font-rubik)', 'Rubik', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'Menlo', 'monospace'],
      },
      borderRadius: {
        card: '12px',
        lg: '16px',
      },
      maxWidth: {
        shell: '1280px',
      },
    },
  },
  plugins: [],
} satisfies Config;
