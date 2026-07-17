import defaultTheme from "tailwindcss/defaultTheme";

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}"],
  theme: {
    extend: {
      fontFamily: {
        mono: ['"JetBrains Mono"', ...defaultTheme.fontFamily.mono],
        sans: ['"Inter"', ...defaultTheme.fontFamily.sans],
        display: ['"JetBrains Mono"', ...defaultTheme.fontFamily.mono],
      },
      colors: {
        base: {
          950: "#030303",
          900: "#09090B",
          800: "#111113",
          700: "#18181B",
          600: "#1E1E22",
        },
        zinc: {
          950: "#09090B",
          900: "#111113",
          800: "#18181B",
          700: "#27272A",
          600: "#3F3F46",
          500: "#52525B",
          400: "#71717A",
          300: "#A1A1AA",
          200: "#D4D4D8",
          100: "#E4E4E7",
          50: "#FAFAFA",
        },
        surface: {
          DEFAULT: "#030303",
          card: "#09090B",
          elevated: "#111113",
          hover: "#18181B",
        },
        border: {
          DEFAULT: "#1E1E22",
          subtle: "#18181B",
          hover: "#27272A",
          accent: "#06B6D4",
        },
        text: {
          primary: "#FAFAFA",
          secondary: "#A1A1AA",
          muted: "#71717A",
        },
        accent: {
          green: "#22C55E",
          cyan: "#06B6D4",
          purple: "#A78BFA",
        },
      },
      backgroundImage: {
        "radial-glow":
          "radial-gradient(ellipse at center, var(--tw-gradient-from) 0%, transparent 70%)",
        "radial-cyan":
          "radial-gradient(ellipse at center, rgba(6,182,212,0.08) 0%, transparent 60%)",
        "radial-green":
          "radial-gradient(ellipse at center, rgba(34,197,94,0.06) 0%, transparent 60%)",
        "subtle-grid":
          "linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)",
        "noise":
          "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.02'/%3E%3C/svg%3E\")",
      },
      backgroundSize: {
        "grid-sm": "32px 32px",
        "grid-md": "48px 48px",
      },
      animation: {
        "fade-in": "fadeIn 0.6s ease-out forwards",
        "slide-up": "slideUp 0.6s ease-out forwards",
        "slide-down": "slideDown 0.3s ease-out forwards",
        "glow-pulse": "glowPulse 4s ease-in-out infinite",
        "slow-pulse": "slowPulse 3s ease-in-out infinite",
        "cursor-blink": "cursorBlink 1s step-end infinite",
        "float": "float 6s ease-in-out infinite",
        "scale-in": "scaleIn 0.5s ease-out forwards",
      },
      keyframes: {
        fadeIn: {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        slideUp: {
          from: { opacity: "0", transform: "translateY(24px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        slideDown: {
          from: { opacity: "0", transform: "translateY(-8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        glowPulse: {
          "0%, 100%": { boxShadow: "0 0 30px rgba(6,182,212,0.08), 0 0 60px rgba(6,182,212,0.03)" },
          "50%": { boxShadow: "0 0 50px rgba(6,182,212,0.15), 0 0 80px rgba(6,182,212,0.05)" },
        },
        slowPulse: {
          "0%, 100%": { opacity: "0.4" },
          "50%": { opacity: "1" },
        },
        cursorBlink: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-12px)" },
        },
        scaleIn: {
          from: { opacity: "0", transform: "scale(0.96)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
      },
    },
  },
  plugins: [],
};
