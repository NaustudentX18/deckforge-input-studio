#!/usr/bin/env node
/**
 * Bundle the design-system CSS into a TypeScript module of string constants.
 *
 * Decky's rollup preset has no CSS pipeline, so both bundles import the styles
 * as strings and inject a <style> tag. Run after editing any src/styles/*.css:
 *   node tools/gen-styles.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";

const read = (name) => readFileSync(`src/styles/${name}`, "utf8");
const escape = (css) => css.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");

const parts = {
  TOKENS_CSS: read("tokens.css"),
  BASE_CSS: read("base.css"),
  LANDING_CSS: read("landing.css"),
};

const body = Object.entries(parts)
  .map(([name, css]) => `export const ${name} = \`${escape(css)}\`;`)
  .join("\n\n");

const out = `/* AUTO-GENERATED from src/styles/*.css by tools/gen-styles.mjs. Edit the CSS. */\n\n`
  + body
  + `\n\nexport const ALL_CSS = [TOKENS_CSS, BASE_CSS, LANDING_CSS].join("\\n");\n`;

writeFileSync("src/styles/index.ts", out);
console.log(`wrote src/styles/index.ts (${out.length} bytes)`);
