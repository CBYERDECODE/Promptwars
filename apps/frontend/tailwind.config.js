/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          950: '#070c14',
          900: '#0b1320',
          850: '#101b2e',
          800: '#16243b',
          700: '#21334f',
          600: '#324a6f',
        },
        charcoal: {
          900: '#121418',
          800: '#1e2229',
          700: '#2b303a',
          600: '#424a57',
        },
        teal: {
          DEFAULT: '#0ea5a0',
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0d9488',
          700: '#0f766e',
        },
      },
    },
  },
  plugins: [],
}
