import type { Config } from "tailwindcss";

/**
 * NOT THE SOURCE OF TRUTH — and deliberately emptied.
 *
 * This project runs Tailwind v4 through `@tailwindcss/postcss`, which takes its
 * configuration from CSS. The real design system lives in
 * `src/app/globals.css`: colours, radii, elevation, typography and motion are
 * all declared there in `@theme`, and `globals.css` contains no `@config`
 * directive, so this file is never loaded.
 *
 * It previously held a full v3-style theme whose colours were written as
 * `hsl(var(--primary))` while the variables hold hex (`#0f6e78`). Every one of
 * those values would have produced an invalid colour the moment anything
 * caused this file to be read. Keeping a plausible-looking but wrong theme
 * next to the real one is worse than keeping none, so what remains is the
 * pointer to where the tokens actually are.
 */
const config: Config = {
  darkMode: "class",
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {},
  plugins: [],
};

export default config;
