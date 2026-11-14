/**
 * Inline SVG icon set.
 *
 * The UI/UX Pro Max checklist is explicit: never use emoji as structural icons
 * — they are font-dependent, render differently per platform, inherit text
 * colour unpredictably and cannot be themed. These are hand-written paths on a
 * 24×24 grid with a consistent 1.75 stroke, matching the outline discipline the
 * rest of the interface uses.
 *
 * Accessibility: every icon is decorative by default (aria-hidden), because in
 * this UI each one sits next to a visible text label. Pass `title` only for a
 * genuinely standalone icon that carries meaning on its own.
 */

import React from 'react';

export interface IconProps {
  size?: number;
  /** Render a text alternative and expose the icon to assistive tech. */
  title?: string;
  className?: string;
  style?: React.CSSProperties;
}

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
});

const wrap = (children: React.ReactNode) =>
  function Icon({ size = 20, title, className, style }: IconProps) {
    return (
      <svg
        {...base(size)}
        className={className}
        style={style}
        {...(title ? { 'aria-hidden': false, role: 'img' as const } : {})}
      >
        {title ? <title>{title}</title> : null}
        {children}
      </svg>
    );
  };

/* ---- Hardware ---------------------------------------------------------- */

/** Guitar body — used for the CRKD family and "guitar detected". */
export const GuitarIcon = wrap(
  <>
    <path d="M14.5 3.5 20 9" />
    <path d="M17 2 22 7" />
    <path d="M12.5 6.5c1.8-1.8 4.2-1.4 5.5 0s1.8 3.7 0 5.5l-1.4 1.4c-.9.9-.9 2 0 2.9" />
    <path d="M16.6 16.3a3.4 3.4 0 0 1 0 4.8 3.4 3.4 0 0 1-4.8 0 3.9 3.9 0 0 1-1.1-2.7c0-.9-.3-1.7-.9-2.3l-3.6-3.6a3.4 3.4 0 0 1 0-4.8 3.4 3.4 0 0 1 4.8 0" />
    <circle cx="8.7" cy="8.7" r="1.1" fill="currentColor" stroke="none" />
  </>,
);

/** Plug / disconnected hardware. */
export const PlugIcon = wrap(
  <>
    <path d="M9 2v6" />
    <path d="M15 2v6" />
    <path d="M6 8h12v3a6 6 0 0 1-6 6 6 6 0 0 1-6-6Z" />
    <path d="M12 17v5" />
  </>,
);

/** Slider / dial — the Mode Dial. */
export const DialIcon = wrap(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 12v-3.5" />
    <path d="M12 8.5a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2Z" fill="currentColor" stroke="none" />
  </>,
);

/** Platform slider / switch. */
export const SwitchIcon = wrap(
  <>
    <rect x="2" y="7" width="20" height="10" rx="5" />
    <circle cx="16" cy="12" r="3" fill="currentColor" stroke="none" />
  </>,
);

/** Lightning — rapid polling / auto profiling. */
export const BoltIcon = wrap(<path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12l1-8.5Z" />);

/* ---- Status ------------------------------------------------------------ */

export const CheckIcon = wrap(<path d="m20 6-11 11-5-5" />);

export const AlertIcon = wrap(
  <>
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
    <path d="M10.3 3.9 1.9 18a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
  </>,
);

export const InfoIcon = wrap(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5" />
    <path d="M12 8h.01" />
  </>,
);

/* ---- Navigation -------------------------------------------------------- */

export const ArrowRightIcon = wrap(<><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>);

export const CopyIcon = wrap(
  <>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h10" />
  </>,
);

/* ---- Gamepad / profiles ------------------------------------------------ */

export const GamepadIcon = wrap(
  <>
    <rect x="2" y="6" width="20" height="12" rx="4" />
    <path d="M7 12h3" />
    <path d="M8.5 10.5v3" />
    <circle cx="16" cy="11" r="1" fill="currentColor" stroke="none" />
    <circle cx="18.5" cy="13.5" r="1" fill="currentColor" stroke="none" />
  </>,
);

/** Drum kit / electronic drums. */
export const DrumsIcon = wrap(
  <>
    <ellipse cx="9" cy="8" rx="6" ry="3" />
    <path d="M3 8v5c0 1.7 2.7 3 6 3s6-1.3 6-3V8" />
    <path d="M15 13.5 21 21" />
    <path d="M18 18.5 19.5 17" />
  </>,
);
