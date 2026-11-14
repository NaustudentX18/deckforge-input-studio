/* AUTO-GENERATED from src/styles/*.css by tools/gen-styles.mjs. Edit the CSS. */

export const TOKENS_CSS = `/* ============================================================================
   DeckForge design tokens.

   Everything visual is expressed here once, then referenced by name. The old
   UI hard-coded 110 distinct hex values across inline styles, which is why
   nothing matched: two panels could both be "surface" and be four different
   colours. These tokens are the single source of truth.

   Palette rationale: the app is used in a dark room on a handheld, often next
   to a game. Surfaces stay near-black and low-contrast so the UI recedes; a
   single hot accent (#e94560, inherited from the original identity) marks the
   one primary action per screen. Status colours are only for status.
   ========================================================================= */

:root {
  /* ---- Colour: surfaces (dark, ordered by elevation) ------------------- */
  --bg:            #0b0b12;
  --surface-1:     #111119;
  --surface-2:     #15151f;
  --surface-3:     #1b1b27;
  --surface-4:     #22222f;
  --surface-inset: #08080d;

  /* ---- Colour: borders ------------------------------------------------ */
  --border:        #26263a;
  --border-strong: #35354d;
  --border-subtle: #1c1c2a;

  /* ---- Colour: text --------------------------------------------------- */
  --text:          #f2f3f7;
  --text-muted:    #a8abc0;
  --text-dim:      #7b7e93;
  --text-faint:    #5b5e72;

  /* ---- Colour: accent + status ---------------------------------------- */
  --accent:        #e94560;
  --accent-hover:  #f25c74;
  --accent-press:  #d13350;
  --accent-soft:   rgba(233, 69, 96, 0.14);
  --accent-ring:   rgba(233, 69, 96, 0.45);

  --success:       #34d399;
  --success-soft:  rgba(52, 211, 153, 0.13);
  --warning:       #fbbf24;
  --warning-soft:  rgba(251, 191, 36, 0.13);
  --danger:        #f87171;
  --danger-soft:   rgba(248, 113, 113, 0.13);
  --info:          #38bdf8;
  --info-soft:     rgba(56, 189, 248, 0.13);

  /* Guitar-blue, used only for the CRKD family accents. */
  --guitar:        #7c5cff;
  --guitar-soft:   rgba(124, 92, 255, 0.15);

  /* ---- Spacing: 4px scale --------------------------------------------- */
  --sp-1: 4px;
  --sp-2: 8px;
  --sp-3: 12px;
  --sp-4: 16px;
  --sp-5: 20px;
  --sp-6: 24px;
  --sp-8: 32px;
  --sp-10: 40px;
  --sp-12: 48px;

  /* ---- Radius ---------------------------------------------------------- */
  --r-sm: 6px;
  --r-md: 10px;
  --r-lg: 14px;
  --r-xl: 20px;
  --r-pill: 999px;

  /* ---- Typography ------------------------------------------------------ */
  --font: -apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", Roboto,
          "Helvetica Neue", Arial, sans-serif;
  --font-mono: ui-monospace, "SF Mono", "JetBrains Mono", "Cascadia Code",
               Consolas, monospace;

  /* Fluid type: clamps scale between phone and desktop without media queries. */
  --fs-display: clamp(24px, 5vw, 34px);
  --fs-h1:      clamp(20px, 3.4vw, 26px);
  --fs-h2:      clamp(16px, 2.2vw, 19px);
  --fs-h3:      clamp(14px, 1.8vw, 16px);
  --fs-body:    clamp(13px, 1.5vw, 14px);
  --fs-sm:      12px;
  --fs-xs:      11px;
  --fs-2xs:     10px;

  --lh-tight: 1.25;
  --lh-body:  1.55;

  /* ---- Elevation ------------------------------------------------------- */
  --shadow-1: 0 1px 2px rgba(0, 0, 0, 0.4);
  --shadow-2: 0 4px 14px rgba(0, 0, 0, 0.45);
  --shadow-3: 0 14px 44px rgba(0, 0, 0, 0.6);
  --shadow-accent: 0 8px 26px rgba(233, 69, 96, 0.28);

  /* ---- Motion ---------------------------------------------------------- */
  --ease: cubic-bezier(0.22, 0.61, 0.36, 1);
  --dur-fast: 120ms;
  --dur: 180ms;

  /* ---- Layout ---------------------------------------------------------- */
  --tap: 44px;                  /* minimum touch target */
  --content-max: 1180px;
  --safe-top: env(safe-area-inset-top, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
  --safe-left: env(safe-area-inset-left, 0px);
  --safe-right: env(safe-area-inset-right, 0px);
}

/* Respect the OS setting instead of animating regardless. */
@media (prefers-reduced-motion: reduce) {
  :root {
    --dur-fast: 0.001ms;
    --dur: 0.001ms;
  }
}
`;

export const BASE_CSS = `/* ============================================================================
   DeckForge base layer: reset, primitives, and the shared component classes.

   Mobile-first throughout: the unprefixed rules describe the phone layout, and
   \`@media (min-width: 900px)\` layers on the desktop layout. That is the reverse
   of the old code, which was written for 1280x800 and then patched down with
   \`isCompact\` branches scattered through every component.
   ========================================================================= */

*,
*::before,
*::after {
  box-sizing: border-box;
}

* {
  margin: 0;
  padding: 0;
  -webkit-tap-highlight-color: transparent;
}

html,
body,
#root {
  height: 100%;
  width: 100%;
}

body {
  background: var(--bg);
  color: var(--text);
  font-family: var(--font);
  font-size: var(--fs-body);
  line-height: var(--lh-body);
  overflow: hidden;
  overscroll-behavior: none;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

/* 100dvh everywhere: the mobile browser toolbar collapses and expands, and
   \`100vh\` clips the bottom of the layout when it does. */
.df-app {
  height: 100dvh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ---- Focus ---------------------------------------------------------------
   Visible focus is a requirement, not decoration; keyboard and Deck trackpad
   both depend on it. Never remove without replacing. */
:focus-visible {
  outline: 2px solid var(--accent-ring);
  outline-offset: 2px;
  border-radius: var(--r-sm);
}

/* ---- Typography helpers ------------------------------------------------- */
.df-eyebrow {
  font-size: var(--fs-2xs);
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--text-dim);
}

.df-display {
  font-size: var(--fs-display);
  font-weight: 850;
  letter-spacing: -0.03em;
  line-height: var(--lh-tight);
  color: var(--text);
}

.df-h1 {
  font-size: var(--fs-h1);
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: var(--lh-tight);
}

.df-h2 {
  font-size: var(--fs-h2);
  font-weight: 750;
  letter-spacing: -0.015em;
}

.df-h3 {
  font-size: var(--fs-h3);
  font-weight: 700;
}

.df-body {
  font-size: var(--fs-body);
  color: var(--text-muted);
}

.df-sm {
  font-size: var(--fs-sm);
  color: var(--text-muted);
}

.df-xs {
  font-size: var(--fs-xs);
  color: var(--text-dim);
}

.df-mono {
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
}

/* Clamp to N lines without JS. */
.df-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* ---- Surfaces ----------------------------------------------------------- */
.df-card {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  padding: var(--sp-4);
}

.df-panel {
  background: var(--surface-1);
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-md);
}

.df-inset {
  background: var(--surface-inset);
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-sm);
}

/* ---- Buttons ------------------------------------------------------------
   One primary action per view. Everything else is secondary or ghost. */
.df-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--sp-2);
  min-height: var(--tap);
  padding: 0 var(--sp-4);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-md);
  background: var(--surface-3);
  color: var(--text);
  font-family: inherit;
  font-size: var(--fs-sm);
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
  white-space: nowrap;
  transition: background var(--dur-fast) var(--ease),
              border-color var(--dur-fast) var(--ease),
              transform var(--dur-fast) var(--ease);
}

.df-btn:hover:not(:disabled) {
  background: var(--surface-4);
  border-color: var(--accent-ring);
}

.df-btn:active:not(:disabled) {
  transform: translateY(1px);
}

.df-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.df-btn--primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
  box-shadow: var(--shadow-accent);
}

.df-btn--primary:hover:not(:disabled) {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
}

.df-btn--primary:active:not(:disabled) {
  background: var(--accent-press);
}

.df-btn--ghost {
  background: transparent;
  border-color: transparent;
  color: var(--text-muted);
}

.df-btn--ghost:hover:not(:disabled) {
  background: var(--surface-3);
  border-color: var(--border);
}

.df-btn--sm {
  min-height: 34px;
  padding: 0 var(--sp-3);
  font-size: var(--fs-xs);
}

/* ---- Badges ------------------------------------------------------------- */
.df-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 8px;
  border-radius: var(--r-pill);
  font-size: var(--fs-2xs);
  font-weight: 700;
  letter-spacing: 0.02em;
  white-space: nowrap;
}

.df-badge--neutral { background: var(--surface-4); color: var(--text-muted); }
.df-badge--accent  { background: var(--accent-soft); color: var(--accent); }
.df-badge--success { background: var(--success-soft); color: var(--success); }
.df-badge--warning { background: var(--warning-soft); color: var(--warning); }
.df-badge--danger  { background: var(--danger-soft); color: var(--danger); }
.df-badge--info    { background: var(--info-soft); color: var(--info); }
.df-badge--guitar  { background: var(--guitar-soft); color: var(--guitar); }

/* ---- Status dot --------------------------------------------------------- */
.df-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.df-dot--live    { background: var(--success); box-shadow: 0 0 0 3px var(--success-soft); }
.df-dot--idle    { background: var(--text-faint); }
.df-dot--error   { background: var(--danger); box-shadow: 0 0 0 3px var(--danger-soft); }

/* ---- Form controls ------------------------------------------------------
   16px is deliberate: iOS zooms the viewport on focus for anything smaller. */
.df-input,
.df-select {
  width: 100%;
  min-height: var(--tap);
  padding: 0 var(--sp-3);
  background: var(--surface-inset);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-sm);
  color: var(--text);
  font-family: inherit;
  font-size: 16px;
  transition: border-color var(--dur-fast) var(--ease);
}

.df-input:focus,
.df-select:focus {
  outline: none;
  border-color: var(--accent-ring);
}

.df-input::placeholder {
  color: var(--text-faint);
}

.df-select {
  appearance: none;
  background-image: linear-gradient(45deg, transparent 50%, var(--text-dim) 50%),
                    linear-gradient(135deg, var(--text-dim) 50%, transparent 50%);
  background-position: calc(100% - 15px) 50%, calc(100% - 10px) 50%;
  background-size: 5px 5px, 5px 5px;
  background-repeat: no-repeat;
  padding-right: 30px;
}

/* ---- Scrollbars --------------------------------------------------------- */
.df-scroll {
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: thin;
  scrollbar-color: var(--border-strong) transparent;
}

.df-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
.df-scroll::-webkit-scrollbar-thumb {
  background: var(--border-strong);
  border-radius: var(--r-pill);
}
.df-scroll::-webkit-scrollbar-track { background: transparent; }

/* ---- Utilities ---------------------------------------------------------- */
.df-row   { display: flex; align-items: center; gap: var(--sp-2); }
.df-col   { display: flex; flex-direction: column; gap: var(--sp-2); }
.df-wrap  { flex-wrap: wrap; }
.df-grow  { flex: 1; min-width: 0; }
.df-sr-only {
  position: absolute;
  width: 1px; height: 1px;
  padding: 0; margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

.df-truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Only the hardware canvas and live monitors opt out of text selection. */
.df-no-select {
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}

/* ============================================================================
   Landing page layout
   ========================================================================= */

.df-page {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: var(--sp-4);
  padding-bottom: calc(var(--sp-10) + var(--safe-bottom));
  padding-left: calc(var(--sp-4) + var(--safe-left));
  padding-right: calc(var(--sp-4) + var(--safe-right));
}

@media (min-width: 900px) {
  .df-page {
    padding: var(--sp-8) var(--sp-10);
    padding-bottom: var(--sp-10);
  }
}

.df-container {
  width: 100%;
  max-width: var(--content-max);
  margin: 0 auto;
}

/* Auto-fit grids: one column on phones, more as width allows. No media query
   per component, and no fixed column counts that break at odd widths. */
.df-grid {
  display: grid;
  gap: var(--sp-3);
  grid-template-columns: 1fr;
}

.df-grid--stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.df-grid--cards { grid-template-columns: 1fr; }

@media (min-width: 620px) {
  .df-grid--cards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .df-grid--stats { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}

@media (min-width: 1020px) {
  .df-grid--cards { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .df-grid { gap: var(--sp-4); }
}

/* Horizontal chip rails scroll on phones instead of wrapping into a ragged
   multi-row block that pushes content off screen. */
.df-tabs {
  display: flex;
  gap: var(--sp-1);
  overflow-x: auto;
  scrollbar-width: none;
  border-bottom: 1px solid var(--border-subtle);
  margin-bottom: var(--sp-4);
  padding-bottom: 0;
  /* Scroll-padding + trailing space so the final tab is fully reachable
     rather than permanently half-cut at the right edge. */
  scroll-padding-inline: var(--sp-2);
  -webkit-overflow-scrolling: touch;
  scroll-snap-type: x proximity;
}

.df-tabs::-webkit-scrollbar { display: none; }

.df-tabs::after {
  content: "";
  flex: 0 0 var(--sp-3);
}

.df-tab {
  flex: 0 0 auto;
  scroll-snap-align: start;
  /* Compact horizontal padding so five short labels fit a 384 px phone without
     needing a scroll; the rail still scrolls if a longer label is added. */
  padding: var(--sp-3) 10px;
  min-height: var(--tap);
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--text-dim);
  font-family: inherit;
  font-size: var(--fs-xs);
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: color var(--dur-fast) var(--ease),
              border-color var(--dur-fast) var(--ease);
}

.df-tab:hover { color: var(--text-muted); }

.df-tab[aria-selected="true"] {
  color: var(--text);
  border-bottom-color: var(--accent);
  font-weight: 700;
}
`;

export const LANDING_CSS = `/* ============================================================================
   Landing page (web studio home).

   Mobile-first: base rules are the phone layout. Desktop is layered at 900px.
   ========================================================================= */

/* ---- Hero --------------------------------------------------------------- */
.df-hero {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  padding-bottom: var(--sp-5);
  border-bottom: 1px solid var(--border-subtle);
  margin-bottom: var(--sp-5);
}

.df-hero__brand {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  min-width: 0;
}

.df-hero__logo {
  width: 48px;
  height: 48px;
  flex-shrink: 0;
  border-radius: var(--r-lg);
  display: grid;
  place-items: center;
  background: linear-gradient(145deg, var(--accent) 0%, #4a1030 100%);
  box-shadow: var(--shadow-accent);
}

.df-hero__title-row {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  flex-wrap: wrap;
}

.df-hero__meta {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}

.df-hero__status {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  font-size: var(--fs-sm);
  color: var(--text-muted);
}

@media (min-width: 900px) {
  .df-hero {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-6);
  }
  .df-hero__meta {
    flex-direction: row;
    align-items: center;
    gap: var(--sp-5);
  }
  .df-hero__logo { width: 60px; height: 60px; }
}

.df-launch {
  min-height: 52px;
  font-size: var(--fs-body);
  padding: 0 var(--sp-5);
  width: 100%;
}

@media (min-width: 620px) {
  .df-launch { width: auto; }
}

/* ---- Stat strip --------------------------------------------------------- */
.df-stat {
  background: var(--surface-2);
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-md);
  padding: var(--sp-3);
  display: flex;
  gap: var(--sp-3);
  align-items: flex-start;
  min-width: 0;
}

.df-stat__icon {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  border-radius: var(--r-sm);
  background: var(--surface-4);
  color: var(--accent);
}

.df-stat__label {
  font-size: var(--fs-xs);
  font-weight: 700;
  color: var(--text);
  margin-bottom: 2px;
}

.df-stat__value {
  font-size: var(--fs-2xs);
  color: var(--text-dim);
  line-height: 1.4;
}

/* ---- Device banner ------------------------------------------------------ */
.df-device {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-3) var(--sp-4);
  border-radius: var(--r-md);
  background: var(--surface-2);
  border: 1px solid var(--border);
  margin-bottom: var(--sp-5);
  flex-wrap: wrap;
}

.df-device--found { border-color: var(--success); background: var(--success-soft); }
.df-device--none  { border-color: var(--border); }

.df-device > svg {
  flex-shrink: 0;
  color: var(--text-muted);
}

.df-device--found > svg {
  color: var(--accent);
}

.df-device__body {
  flex: 1;
  min-width: 160px;
}

/* ---- Section heading ---------------------------------------------------- */
.df-section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sp-3);
  flex-wrap: wrap;
  margin-bottom: var(--sp-3);
}

/* ---- Profile card ------------------------------------------------------- */
.df-profile {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  padding: var(--sp-4);
  transition: border-color var(--dur) var(--ease),
              transform var(--dur) var(--ease);
}

.df-profile:hover {
  border-color: var(--border-strong);
}

.df-profile__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--sp-2);
}

.df-profile__title {
  font-size: var(--fs-h3);
  font-weight: 750;
  color: var(--text);
  line-height: var(--lh-tight);
}

.df-profile__notes {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
}

.df-profile__note {
  position: relative;
  padding-left: var(--sp-4);
  font-size: var(--fs-xs);
  color: var(--text-dim);
  line-height: 1.5;
}

.df-profile__note::before {
  content: "";
  position: absolute;
  left: 4px;
  top: 7px;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--text-faint);
}

.df-profile__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-2);
  margin-top: auto;
  padding-top: var(--sp-1);
}

/* ---- Mode dial table ---------------------------------------------------- */
.df-modes {
  display: grid;
  gap: 1px;
  background: var(--border-subtle);
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-md);
  overflow: hidden;
}

.df-mode {
  display: grid;
  grid-template-columns: 34px 1fr;
  gap: var(--sp-3);
  align-items: start;
  padding: var(--sp-3);
  background: var(--surface-2);
}

.df-mode__pos {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: var(--r-sm);
  background: var(--surface-4);
  color: var(--text-muted);
  font-size: var(--fs-xs);
  font-weight: 800;
  font-family: var(--font-mono);
}

.df-mode--key .df-mode__pos { background: var(--warning-soft); color: var(--warning); }
.df-mode--festival .df-mode__pos { background: var(--accent-soft); color: var(--accent); }

@media (min-width: 620px) {
  .df-mode { grid-template-columns: 34px 190px 1fr; }
}

/* ---- Compatibility matrix ----------------------------------------------
   Wide tables must scroll horizontally on a phone, and say so: a silently
   clipped table looks like missing data rather than off-screen data. */
.df-table-scroll {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  border-radius: var(--r-sm);
  /* Faint edge shadow hints that there is more to the right. */
  background:
    linear-gradient(to right, var(--surface-2) 30%, rgba(21, 21, 31, 0)) left center / 24px 100% no-repeat,
    linear-gradient(to left, var(--surface-2) 30%, rgba(21, 21, 31, 0)) right center / 24px 100% no-repeat;
}

.df-table-scroll table {
  min-width: 560px;
}

.df-matrix {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--fs-xs);
}

.df-matrix th,
.df-matrix td {
  padding: var(--sp-2) var(--sp-3);
  text-align: left;
  border-bottom: 1px solid var(--border-subtle);
  vertical-align: top;
}

.df-matrix th {
  color: var(--text-dim);
  font-size: var(--fs-2xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  white-space: nowrap;
}

.df-matrix td { color: var(--text-muted); }
.df-matrix tr:last-child td { border-bottom: none; }

.df-yes { color: var(--success); font-weight: 700; }
.df-no  { color: var(--text-faint); }
.df-partial { color: var(--warning); font-weight: 700; }

/* ---- Code block --------------------------------------------------------- */
.df-code {
  display: block;
  position: relative;
  background: var(--surface-inset);
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-sm);
  padding: var(--sp-3);
  padding-right: 64px;
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  color: var(--info);
  overflow-x: auto;
  white-space: pre;
  line-height: 1.6;
}

.df-code__copy {
  position: absolute;
  top: 6px;
  right: 6px;
  min-height: 26px;
  padding: 0 8px;
  font-size: var(--fs-2xs);
  font-weight: 700;
  background: var(--surface-4);
  color: var(--text-muted);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-sm);
  cursor: pointer;
  font-family: inherit;
}

.df-code__copy:hover { color: var(--text); }

/* ---- Steps -------------------------------------------------------------- */
.df-steps {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  counter-reset: step;
  padding: 0;
  margin: 0;
}

.df-step {
  position: relative;
  padding-left: var(--sp-8);
  counter-increment: step;
  font-size: var(--fs-sm);
  color: var(--text-muted);
  line-height: var(--lh-body);
}

.df-step::before {
  content: counter(step);
  position: absolute;
  left: 0;
  top: -2px;
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--surface-4);
  color: var(--text);
  font-size: var(--fs-2xs);
  font-weight: 800;
}

.df-step strong { color: var(--text); font-weight: 700; }

/* ---- Notice ------------------------------------------------------------- */
.df-notice {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-3);
  padding: var(--sp-3) var(--sp-4);
  border-radius: var(--r-md);
  font-size: var(--fs-sm);
  line-height: var(--lh-body);
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--text-muted);
}

.df-notice > svg {
  flex-shrink: 0;
  margin-top: 2px;
}

.df-notice--success { border-color: var(--success); background: var(--success-soft); color: #c8f7e3; }
.df-notice--warning { border-color: var(--warning); background: var(--warning-soft); color: #fde9b8; }
.df-notice--danger  { border-color: var(--danger);  background: var(--danger-soft);  color: #ffd5d5; }
.df-notice--info    { border-color: var(--info);    background: var(--info-soft);    color: #cdeeff; }

/* ---- Skeleton ----------------------------------------------------------- */
.df-skeleton {
  background: linear-gradient(
    90deg,
    var(--surface-2) 25%,
    var(--surface-3) 37%,
    var(--surface-2) 63%
  );
  background-size: 400% 100%;
  animation: df-shimmer 1.4s ease infinite;
  border-radius: var(--r-md);
  height: 148px;
}

@media (prefers-reduced-motion: reduce) {
  .df-skeleton { animation: none; }
}

@keyframes df-shimmer {
  0%   { background-position: 100% 50%; }
  100% { background-position: 0 50%; }
}

/* ---- Empty state -------------------------------------------------------- */
.df-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-8) var(--sp-4);
  text-align: center;
  border: 1px dashed var(--border-strong);
  border-radius: var(--r-lg);
  color: var(--text-dim);
  font-size: var(--fs-sm);
}


/* ---- Product screenshots ------------------------------------------------
   Real captures of the running app, not mockups. A bordered frame keeps them
   legible against the dark page, and \`loading="lazy"\` avoids paying for the
   off-screen ones. */
.df-showcase {
  display: grid;
  gap: var(--sp-3);
  grid-template-columns: 1fr;
  margin-bottom: var(--sp-4);
}

@media (min-width: 620px) {
  .df-showcase { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (min-width: 1020px) {
  .df-showcase { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}

.df-shot {
  display: block;
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  overflow: hidden;
  background: var(--surface-2);
  position: relative;
}

.df-shot img {
  display: block;
  width: 100%;
  height: auto;
  /* Never let an intrinsic-width image overflow its frame. */
  max-width: 100%;
}

.df-shot figcaption {
  padding: var(--sp-2) var(--sp-3);
  font-size: var(--fs-xs);
  color: var(--text-dim);
  border-top: 1px solid var(--border-subtle);
}

/* The phone capture is portrait; give it its own narrower track so it is not
   stretched across a desktop column. */
.df-shot--phone {
  max-width: 300px;
  width: 300px;
  margin-inline: auto;
  /* A grid item stretches by default; without this the portrait capture is
     pulled wide and the max-width appears to do nothing. */
  justify-self: center;
  align-self: start;
}
`;

export const ALL_CSS = [TOKENS_CSS, BASE_CSS, LANDING_CSS].join("\n");
