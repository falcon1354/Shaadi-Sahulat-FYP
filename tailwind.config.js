/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#FFF5F8',
          100: '#FDF2F3',
          200: '#FBEFF1',
          300: '#FEF4F7',
          400: '#f5e3e6',
          500: '#ECD4A8',
          600: '#dfc08d',
          700: '#d0ac72',
          800: '#c09858',
          900: '#a37b3d',
        },
        shaadi: {
          gold: '#ECD4A8',
          roseLight: '#FDF2F3',
          roseMedium: '#FBEFF1',
          white: '#FCFBFB',
          roseSoft: '#FEF4F7',
          roseBlush: '#FFF5F8',
          maroon: '#800020',
          cream: '#FFF8E7',
          green: '#10b981',
          rose: '#f43f5e',
        }
      },
      fontFamily: {
        sans: ['Inter', '"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'Outfit', 'sans-serif'],
        heading: ['Outfit', '"Plus Jakarta Sans"', 'sans-serif'],
        serif: ['"Cormorant Garamond"', 'Georgia', 'serif'],
      },
      boxShadow: {
        'soft': '0 4px 20px -2px rgba(0, 0, 0, 0.05)',
        'luxury': '0 10px 30px -5px rgba(163, 123, 61, 0.08), 0 4px 12px -2px rgba(0, 0, 0, 0.03)',
        'card': '0 1px 3px rgba(0,0,0,0.02), 0 6px 16px rgba(0,0,0,0.03)',
        'card-hover': '0 12px 32px -4px rgba(0, 0, 0, 0.08), 0 4px 12px -2px rgba(163, 123, 61, 0.06)',
      }
    },
  },
  plugins: [],
};
