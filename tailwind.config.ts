import type { Config } from "tailwindcss";

/**
 * Tailwind v4 configuration.
 *
 * NOTE: Tailwind v4 reads most of its configuration from CSS (`globals.css`
 * uses `@theme inline { ... }` and `@custom-variant dark ...`).
 * This file is kept for backwards compatibility with tools that still read
 * `tailwind.config.ts` (e.g. some IDE extensions, the shadcn CLI).
 *
 * The `content` paths below are also redundant in v4 (it auto-detects),
 * but listing them explicitly avoids edge cases with monorepos.
 */
const config: Config = {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
