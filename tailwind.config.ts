import type { Config } from "tailwindcss";

// Every color is a CSS variable from app/globals.css, so utilities follow the
// light/dark theme and still accept opacity modifiers (bg-accent/10).
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        page: token("page"),
        surface: {
          DEFAULT: token("surface"),
          2: token("surface-2"),
          3: token("surface-3"),
          4: token("surface-4"),
        },
        line: token("line"),
        fg: {
          DEFAULT: token("fg"),
          2: token("fg-2"),
          3: token("fg-3"),
        },
        muted: token("muted"),
        faint: token("faint"),
        accent: {
          DEFAULT: token("accent"),
          hi: token("accent-hi"),
        },
        "on-accent": token("on-accent"),
        danger: token("danger"),
        warn: token("warn"),
        info: token("info"),
        viz: {
          blue: token("viz-blue"),
          orange: token("viz-orange"),
          yellow: token("viz-yellow"),
        },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
