/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // Subtle elevation scale used across cards, toolbars and panels.
      // (Tailwind v3 has no built-in `xs`/`2xs`, so we define them explicitly.)
      boxShadow: {
        '2xs': '0 1px 2px 0 rgb(15 23 42 / 0.04)',
        xs: '0 1px 2px 0 rgb(15 23 42 / 0.05), 0 1px 3px 0 rgb(15 23 42 / 0.04)',
      },
      colors: {
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
      },
    },
  },
  plugins: [],
}
