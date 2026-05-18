import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        ...require('tailwindcss/colors'),
        crimson: {
          50:  '#fdf2f4',
          100: '#fce7eb',
          200: '#f9d0d8',
          300: '#f4a8b8',
          400: '#ec7292',
          500: '#c23b5a',
          600: '#a52d47',
          700: '#7d1535',
          800: '#661029',
          900: '#4a0a1d',
        },
        gold: {
          50:  '#fdf8ee',
          100: '#faf0d5',
          200: '#f4dfa3',
          300: '#ecc965',
          400: '#d4aa5a',
          500: '#c4963a',
          600: '#a87d28',
          700: '#8b6520',
          800: '#6e4f18',
          900: '#4d3710',
        },
      },
    },
  },
  plugins: [],
};

export default config;
