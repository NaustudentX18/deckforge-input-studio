// Blueprint SVG sizing.
//
// Every hardware blueprint is drawn in a fixed coordinate space (the viewBox).
// Previously each one also pinned its pixel size, e.g. `width: 420 * scale`,
// which meant a tall guitar (420×740) was always 740px tall — taller than the
// space available on a 1280×800 Deck once the top bar, status bar and the view
// switcher are subtracted, and far taller than a phone. The drawing overflowed
// its panel and the bottom of the guitar was unreachable.
//
// A viewBox already carries the aspect ratio, so the element only needs limits,
// not a fixed size: fill the box up to the authored size, and let
// `preserveAspectRatio="xMidYMid meet"` letterbox the drawing inside. The
// result scales down on small screens and never grows past its design size.

export interface BlueprintSize {
  width: number;
  height: number;
}

/**
 * Style that fits a fixed-size SVG into its container without distortion.
 *
 * @param width  authored width in viewBox units
 * @param height authored height in viewBox units
 * @param scale  user zoom multiplier; capped so it cannot exceed the authortime size
 */
export function fitSvgStyle(
  width: number,
  height: number,
  scale = 1,
): Record<string, string | number> {
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  return {
    // Fill the available box, bounded by the authored size.
    width: '100%',
    height: '100%',
    maxWidth: `${Math.round(width * safeScale)}px`,
    maxHeight: `${Math.round(height * safeScale)}px`,
    // The SVG's own preserveAspectRatio handles letterboxing.
    display: 'block',
    margin: 'auto',
  };
}

/** Aspect-preserving box for a blueprint, usable when a wrapper needs a ratio. */
export function blueprintAspectRatio({ width, height }: BlueprintSize): number {
  if (!width || !height) return 1;
  return width / height;
}
