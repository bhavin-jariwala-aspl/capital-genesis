/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Primary and accent are CSS variables so a tenant's Appearance settings
        // recolour the whole UI at runtime. utils/appearance.js writes light
        // (--p-*, --a-*) and dark (--pd-*, --ad-*) ramps as "r g b" triplets;
        // index.css points --pc-* / --ac-* at whichever the current mode needs.
        primary: {
          50: 'rgb(var(--pc-50) / <alpha-value>)',
          100: 'rgb(var(--pc-100) / <alpha-value>)',
          200: 'rgb(var(--pc-200) / <alpha-value>)',
          300: 'rgb(var(--pc-300) / <alpha-value>)',
          400: 'rgb(var(--pc-400) / <alpha-value>)',
          500: 'rgb(var(--pc-500) / <alpha-value>)',
          600: 'rgb(var(--pc-600) / <alpha-value>)',
          700: 'rgb(var(--pc-700) / <alpha-value>)',
          800: 'rgb(var(--pc-800) / <alpha-value>)',
          900: 'rgb(var(--pc-900) / <alpha-value>)',
          950: 'rgb(var(--pc-950) / <alpha-value>)',
          DEFAULT: 'rgb(var(--pc-500) / <alpha-value>)',
        },
        accent: {
          50: 'rgb(var(--ac-50) / <alpha-value>)',
          100: 'rgb(var(--ac-100) / <alpha-value>)',
          200: 'rgb(var(--ac-200) / <alpha-value>)',
          300: 'rgb(var(--ac-300) / <alpha-value>)',
          400: 'rgb(var(--ac-400) / <alpha-value>)',
          500: 'rgb(var(--ac-500) / <alpha-value>)',
          600: 'rgb(var(--ac-600) / <alpha-value>)',
          700: 'rgb(var(--ac-700) / <alpha-value>)',
          800: 'rgb(var(--ac-800) / <alpha-value>)',
          900: 'rgb(var(--ac-900) / <alpha-value>)',
          950: 'rgb(var(--ac-950) / <alpha-value>)',
          DEFAULT: 'rgb(var(--ac-500) / <alpha-value>)',
        },
        // Text colour that stays readable on the primary / accent colour (mode-aware)
        'on-primary': 'rgb(var(--onpc) / <alpha-value>)',
        'on-accent':  'rgb(var(--on-accent) / <alpha-value>)',
        // The derived middle stop of brand gradients (between primary and accent).
        // Use `via-mid` / `to-mid-600` instead of a fixed violet or purple.
        mid: {
          DEFAULT: 'rgb(var(--gc-mid) / <alpha-value>)',
          500: 'rgb(var(--gc-mid) / <alpha-value>)',
          600: 'rgb(var(--gc-mid-600) / <alpha-value>)',
        },
        // Neutral ramp follows the tenant's "Neutral tone" (cool / slate / warm / graphite).
        gray: {
          50: 'rgb(var(--n-50) / <alpha-value>)',
          100: 'rgb(var(--n-100) / <alpha-value>)',
          200: 'rgb(var(--n-200) / <alpha-value>)',
          300: 'rgb(var(--n-300) / <alpha-value>)',
          400: 'rgb(var(--n-400) / <alpha-value>)',
          500: 'rgb(var(--n-500) / <alpha-value>)',
          600: 'rgb(var(--n-600) / <alpha-value>)',
          700: 'rgb(var(--n-700) / <alpha-value>)',
          800: 'rgb(var(--n-800) / <alpha-value>)',
          900: 'rgb(var(--n-900) / <alpha-value>)',
          950: 'rgb(var(--n-950) / <alpha-value>)',
        },
        // Dark-mode surface stack (canvas → chrome → panel → raised); follows
        // the tenant's "Dark mode surfaces" setting. Use `dark:bg-night-2`
        // instead of a literal hex.
        night: {
          0: 'rgb(var(--s-0) / <alpha-value>)',
          1: 'rgb(var(--s-1) / <alpha-value>)',
          2: 'rgb(var(--s-2) / <alpha-value>)',
          3: 'rgb(var(--s-3) / <alpha-value>)',
        },
        // Secondary — bright cyan/sky for cool contrast
        sky2: {
          50:  '#ecfeff',
          100: '#cffafe',
          200: '#a5f3fc',
          300: '#67e8f9',
          400: '#22d3ee',
          500: '#06b6d4',
          600: '#0891b2',
          700: '#0e7490',
        },
        // Surface — bright, airy backgrounds with a faint cool tint
        surface: {
          DEFAULT: '#f6f7fe',
          50:      '#fbfcff',
          100:     '#f2f4fd',
          200:     '#e9ecfb',
        },
      },
      // The radius scale follows the tenant's "Corner Radius" setting.
      borderRadius: {
        sm:    'var(--radius-sm, 4px)',
        md:    'var(--radius-md, 6px)',
        lg:    'var(--radius-lg, 8px)',
        xl:    'var(--radius-xl, 12px)',
        '2xl': 'var(--radius-2xl, 16px)',
        '3xl': 'var(--radius-3xl, 24px)',
      },
      backgroundImage: {
        'brand-gradient':  'linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%)',
        'brand-soft':      'linear-gradient(135deg, #eef2ff 0%, #faf5ff 50%, #fdf2f8 100%)',
        'aurora':          'radial-gradient(1200px 600px at 8% -10%, rgba(99,102,241,0.14), transparent 60%), radial-gradient(1000px 500px at 100% 0%, rgba(217,70,239,0.10), transparent 55%), radial-gradient(900px 600px at 50% 120%, rgba(34,211,238,0.10), transparent 55%)',
        'sheen':           'linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.55) 100%)',
      },
      fontFamily: {
        sans:    ['var(--font-sans, Inter)', 'Inter', 'system-ui', 'sans-serif'],
        display: ['var(--font-display, "Plus Jakarta Sans")', 'Inter', 'system-ui', 'sans-serif'],
        mono:    ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      // Apple-like motion curves: `ease-spring` for enter/press, `ease-ios` for colour/opacity.
      transitionTimingFunction: {
        spring: 'cubic-bezier(0.32, 0.72, 0, 1)',
        ios:    'cubic-bezier(0.25, 0.1, 0.25, 1)',
      },
      spacing: {
        sidebar: 'var(--sidebar-w, 232px)',
      },
      animation: {
        'fade-in':   'fadeIn 0.18s ease-out',
        'slide-in':  'slideIn 0.2s ease-out',
        'slide-up':  'slideUp 0.28s cubic-bezier(0.32, 0.72, 0, 1)',
        'scale-in':  'scaleIn 0.22s cubic-bezier(0.32, 0.72, 0, 1)',
        'pop':       'pop 0.32s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'spin-slow': 'spin 3s linear infinite',
        'float':     'float 6s ease-in-out infinite',
        'shimmer':   'shimmer 2.2s linear infinite',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        slideIn: {
          from: { transform: 'translateY(-6px)', opacity: '0' },
          to:   { transform: 'translateY(0)',    opacity: '1' },
        },
        slideUp: {
          from: { transform: 'translateY(10px)', opacity: '0' },
          to:   { transform: 'translateY(0)',    opacity: '1' },
        },
        scaleIn: {
          from: { transform: 'scale(0.96)', opacity: '0' },
          to:   { transform: 'scale(1)',    opacity: '1' },
        },
        pop: {
          '0%':   { transform: 'scale(0.9)', opacity: '0' },
          '100%': { transform: 'scale(1)',   opacity: '1' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%':      { transform: 'translateY(-8px)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-500px 0' },
          '100%': { backgroundPosition: '500px 0' },
        },
      },
      boxShadow: {
        'xs':       '0 1px 2px 0 rgb(var(--pc-600) / 0.05)',
        'card':     '0 1px 3px 0 rgb(var(--pc-600) / 0.07), 0 1px 2px -1px rgb(var(--pc-600) / 0.05)',
        'card-md':  '0 6px 18px -4px rgb(var(--pc-500) / 0.14), 0 2px 8px -3px rgb(var(--pc-500) / 0.08)',
        'elevated': '0 20px 48px -12px rgb(var(--pc-500) / 0.24), 0 6px 16px -6px rgb(var(--ac-500) / 0.12)',
        'glow':     '0 0 0 3px rgb(var(--pc-500) / 0.18)',
        'primary':  '0 8px 22px -4px rgb(var(--pc-500) / 0.42)',
        'accent':   '0 8px 22px -4px rgb(var(--ac-500) / 0.38)',
        'soft':     '0 8px 30px -10px rgb(var(--pc-500) / 0.18)',
        // Apple-style layered elevation: a hairline plus a soft, wide ambient shadow.
        'hig':      '0 0 0 0.5px rgb(var(--n-900) / 0.06), 0 1px 2px rgb(var(--n-900) / 0.04), 0 12px 32px -12px rgb(var(--n-900) / 0.10)',
        'hig-lg':   '0 0 0 0.5px rgb(var(--n-900) / 0.08), 0 8px 24px -8px rgb(var(--n-900) / 0.18), 0 32px 64px -24px rgb(var(--n-900) / 0.22)',
      },
    },
  },
  plugins: [],
};
