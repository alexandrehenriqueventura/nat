/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Paleta principal do painel
        surface: {
          DEFAULT: '#0f172a', // fundo geral (slate-900)
          card:    '#1e293b', // cards e painéis (slate-800)
          hover:   '#334155', // hover em linhas (slate-700)
          border:  '#334155', // bordas
          muted:   '#475569', // texto secundário (slate-600)
        },
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-in-right': 'slideInRight 0.25s ease-out',
      },
      keyframes: {
        slideInRight: {
          from: { transform: 'translateX(100%)' },
          to:   { transform: 'translateX(0)' },
        },
      },
    },
  },
  plugins: [],
}
