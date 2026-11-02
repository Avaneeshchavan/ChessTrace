// Mirrors tokens.css so Tailwind config and JS logic (e.g. eval-bar color
// interpolation) can reference the same values without duplicating hex
// codes in two places by hand. Keep in sync with tokens.css.

export const colors = {
  background: '#fcfcfb',   // warm ivory
  surface: '#ffffff',      // white
  border: '#e7e5dd',       // reference border
  primary: '#4b6b4e',      // tournament green
  accent: '#3d5a40',       // dark green
  warning: '#ef4444',      // Red for low-confidence vision flags
  text: {
    main: '#26352a',       // dark green text
    muted: '#788079',      // muted green text
  },

  boardLight: '#EEEED2',
  boardDark: '#769656',
  boardSelect: 'rgba(75, 107, 78, 0.45)', // match tournament green
  boardLowConf: 'rgba(239, 68, 68, 0.75)',
};

export const fonts = {
  display: '"Inter", "Segoe UI", system-ui, sans-serif',
  body: '"Inter", "Segoe UI", system-ui, sans-serif',
  mono: '"JetBrains Mono", "IBM Plex Mono", ui-monospace, monospace',
};
