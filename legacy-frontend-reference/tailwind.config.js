import { colors, fonts } from './src/design-system/tokens.js';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      background: colors.background,
      surface: colors.surface,
      border: colors.border,
      primary: colors.primary,
      accent: colors.accent,
      warning: colors.warning,
      'text-main': colors.text.main,
      'text-muted': colors.text.muted,
      'board-light': colors.boardLight,
      'board-dark': colors.boardDark,
      white: '#ffffff',
      black: '#000000',
    },
    fontFamily: {
      display: fonts.display.split(',').map((f) => f.trim()),
      body: fonts.body.split(',').map((f) => f.trim()),
      mono: fonts.mono.split(',').map((f) => f.trim()),
    },
    fontSize: {
      eyebrow: ['0.6875rem', { letterSpacing: '0.09em', lineHeight: '1.4' }],
      body: ['0.9375rem', { lineHeight: '1.55' }],
      data: ['0.875rem', { lineHeight: '1.4' }],
      h2: ['1.25rem', { lineHeight: '1.3' }],
      h1: ['2rem', { lineHeight: '1.15' }],
    },
    borderRadius: {
      none: '0',
      sm: '4px',
      md: '6px',
      lg: '8px',
      full: '9999px',
    },
    extend: {
      spacing: {
        13: '3.25rem',
      },
    },
  },
  plugins: [],
};
