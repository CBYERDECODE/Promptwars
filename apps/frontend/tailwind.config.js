/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      /**
       * One variable sans for the whole product. Inter is preferred when the
       * platform provides it (or a designer loads it); otherwise the native UI
       * sans is used, so the app never depends on a network font request and
       * never falls back to a serif.
       */
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      /**
       * Semantic colour tokens. Every value here was checked against WCAG 2.2 AA
       * on the surface it is used on (white / #F8FAFC). Status colour is NEVER
       * the only signal: `Badge`, `MetricTile`, `DiffRow` and `ConfidenceMeter`
       * always render an icon plus a text label alongside the tone.
       */
      colors: {
        // Legacy palette retained so existing views keep working untouched.
        command: {
          bg: '#F8FAFC',
          card: '#FFFFFF',
          border: '#E2E8F0',
          navy: '#0F172A',
          slate: '#475569',
          muted: '#64748B',
          primary: '#2563EB',
          emergency: '#DC2626',
          success: '#15803D',
          warning: '#B45309',
        },
        surface: {
          DEFAULT: '#FFFFFF',
          muted: '#F8FAFC',
          sunken: '#F1F5F9',
        },
        ink: {
          DEFAULT: '#0F172A',
          muted: '#475569',
          subtle: '#64748B',
          faint: '#94A3B8',
        },
        line: {
          DEFAULT: '#E2E8F0',
          strong: '#CBD5E1',
        },
        accent: {
          DEFAULT: '#2563EB',
          strong: '#1D4ED8',
          soft: '#EFF6FF',
          border: '#BFDBFE',
        },
        critical: {
          DEFAULT: '#B91C1C',
          soft: '#FEF2F2',
          border: '#FECACA',
        },
        warning: {
          DEFAULT: '#B45309',
          soft: '#FFFBEB',
          border: '#FDE68A',
        },
        success: {
          DEFAULT: '#15803D',
          soft: '#F0FDF4',
          border: '#BBF7D0',
        },
        // Deliberately distinct from `warning`: "we do not know" is not "watch out".
        uncertain: {
          DEFAULT: '#7C3AED',
          soft: '#F5F3FF',
          border: '#DDD6FE',
        },
      },
      borderRadius: {
        control: '0.5rem',
        card: '0.75rem',
        panel: '1rem',
      },
      boxShadow: {
        // Subtle elevation scale used across cards, toolbars and panels.
        '2xs': '0 1px 2px 0 rgb(15 23 42 / 0.04)',
        xs: '0 1px 2px 0 rgb(15 23 42 / 0.05), 0 1px 3px 0 rgb(15 23 42 / 0.04)',
        card: '0 1px 3px 0 rgb(15 23 42 / 0.06), 0 1px 2px -1px rgb(15 23 42 / 0.06)',
        panel: '0 8px 24px -8px rgb(15 23 42 / 0.14), 0 2px 6px -2px rgb(15 23 42 / 0.08)',
      },
      transitionDuration: {
        fast: '150ms',
        base: '200ms',
        slow: '250ms',
      },
      minHeight: {
        // Minimum accessible pointer target.
        tap: '44px',
      },
      minWidth: {
        tap: '44px',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'rise-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 200ms ease-out both',
        'rise-in': 'rise-in 200ms ease-out both',
      },
    },
  },
  plugins: [],
}
